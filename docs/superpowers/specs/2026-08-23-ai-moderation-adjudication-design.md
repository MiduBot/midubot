# Moderacion IA con adjudicacion y revision por excepciones

**Fecha:** 2026-08-23
**Estado:** Diseno aprobado en conversacion
**Alcance:** `src/features/ai-mod/`, `src/features/job-guard/` y su sistema compartido de feedback, auditoria y acciones

## Resumen

`ai-mod` y `job-guard` dejaran de pedir confirmacion humana para cada deteccion. Cada evaluacion usara dos llamadas ciegas y separadas al mismo `AI_MODEL`: un clasificador orientado a detectar infracciones y un juez mas estricto orientado a exigir evidencia. Un adjudicador determinista, no el modelo, decidira si existe acuerdo suficiente para actuar y autocerrar el caso.

El staff recibira alertas inmediatas solo ante desacuerdos, baja confianza, abstenciones y auditorias aleatorias. Las decisiones automaticas apareceran en un digest diario. Toda tarjeta de revision o resumen incluira contenido real del mensaje objetivo; nunca mostrara solamente autor, confianza y razon IA.

El aprendizaje dejara de generar notas libres mediante otra llamada al mismo modelo. Solo correcciones humanas estructuradas podran entrar como ejemplos futuros. Confirmaciones serviran para medir precision, no para auto-reforzar decisiones del modelo.

## Problemas actuales

### Revision sin evidencia visible

`ai_mod_cases.content` y `job_guard_cases.content` guardan el texto, pero los embeds de alerta no lo muestran. El moderador ve autor, canal, confianza, razon y accion, pero debe adivinar que se elimino.

`ai-mod` tambien agrupa varios mensajes de un autor en un solo caso y usa solo el contenido del candidato primario. Una confirmacion puede abarcar varios borrados sin indicar cual era correcto o incorrecto.

### Feedback ruidoso y autorreferencial

Cada click `Correcto` o `Incorrecto` llama otra vez al mismo modelo para producir una nota libre. La nota se inyecta en clasificaciones futuras. Esto no entrena el modelo, no calibra su confianza y puede convertir un error en una regla persistente.

La resolucion del caso depende de que esa nota se genere y guarde. Si el proveedor esta caido, la decision humana ya fue tomada pero el caso permanece pendiente y los botones deben pulsarse otra vez.

### Politicas de fallo inconsistentes

`job-guard` no elimina cuando la IA falla. `ai-mod`, en cambio, convierte todos los candidatos de texto en infractores con confianza `0` cuando falla la llamada, y despues aplica timeout y borrado. Sin reply, esos candidatos son hasta diez mensajes recientes no escritos por quien reporta.

### Seleccion de objetivo insegura

Con reply, `ai-mod` tiene un objetivo explicito. Sin reply, clasifica los ultimos diez mensajes como candidatos independientes, pero no relaciona la intencion del reporte con el mensaje supuestamente reportado.

### Imagenes promovidas sin confirmacion

Toda imagen candidata procesada por `ai-mod` puede terminar persistida como imagen scam, incluso cuando es desconocida y no existe confirmacion humana. Esto puede contaminar el blocklist que luego consume `monitorImages`.

### Sin medicion representativa

Solo se guardan detecciones positivas. Los `allow` no quedan disponibles para auditoria, por lo que no puede medirse falsos negativos. Tampoco se persisten version de prompt, estado de cada llamada, modelo efectivo, tokens o latencia junto con la decision.

### Configuracion desconectada

`IgnoredChannelsService` permite administrar canales y categorias ignorados, pero `handleModMention` no consulta esa configuracion antes de evaluar y actuar.

## Objetivos

1. Reducir revisiones humanas a excepciones y una muestra pequena de auditoria.
2. Mantener precision auditada de acciones destructivas igual o superior a 98%.
3. Mostrar siempre mensaje objetivo, reporte y adjuntos relevantes en cualquier salida enviada al staff.
4. Evitar acciones basadas en fallos totales, objetivos ambiguos o evidencia inventada.
5. Separar evaluacion IA, adjudicacion determinista, accion, revision humana y aprendizaje.
6. Medir acuerdos, desacuerdos, errores, correcciones, falsos positivos auditados y carga humana por feature.
7. Conservar casos historicos y botones ya publicados durante la transicion.

## No objetivos

- Usar un segundo proveedor o modelo distinto para el juez.
- Fine-tuning o entrenamiento de pesos.
- Clasificacion multimodal de imagenes desconocidas mediante vision.
- Dashboard web.
- Restaurar mensajes eliminados; Discord no ofrece esa operacion.
- Fusionar las reglas de ofertas laborales, scam y selfpromo en una sola politica.
- Auto-generar reglas o ejemplos a partir de acuerdos entre modelos.

## Decisiones aprobadas

| Tema | Decision |
|---|---|
| Arquitectura | Clasificador + juez ciego + adjudicador determinista |
| Modelo | Ambas llamadas usan `AI_MODEL` |
| Independencia | Juez no recibe veredicto, confianza ni razon del clasificador |
| Staff | Solo excepciones inmediatas, auditoria aleatoria y digest diario |
| Aprendizaje | Solo correcciones humanas estructuradas |
| Auto-refuerzo | Prohibido para acuerdos IA |
| Objetivo sin reply | Ambos modelos seleccionan indices dentro de contexto numerado |
| Desacuerdo `job-guard` | Conservar mensaje y pedir revision |
| Desacuerdo `ai-mod` | Accion temporal de riesgo cuando hay objetivo inequivoco |
| Timeout temporal | 1 hora |
| Evidencia visible | Mensaje objetivo + adjuntos + reporte que menciono a staff |
| Imagen desconocida | Nunca entra al blocklist sin confirmacion humana |
| Digest | Diario, con snippet real de cada accion mostrada |
| Auditoria | 5% inicial de acuerdos automaticos |

## Arquitectura

```text
trigger
  -> evidence collector especifico
  -> evaluador dual compartido
       -> clasificador
       -> juez ciego
  -> validador de salidas
  -> adjudicador determinista
  -> persistencia inmutable
  -> coordinador idempotente de acciones
  -> excepcion inmediata o digest diario
```

### Adaptadores por feature

`ai-mod` y `job-guard` conservan triggers, prompts de politica y acciones propias. Cada uno implementa un adaptador con cinco responsabilidades:

1. Determinar si el trigger aplica.
2. Recopilar reporte, candidatos y adjuntos antes de cualquier borrado.
3. Proveer reglas y etiquetas validas de su politica.
4. Convertir resultado adjudicado en una accion concreta.
5. Construir presentacion especifica sin ocultar evidencia original.

### Evaluador dual compartido

El evaluador lanza dos solicitudes independientes con el mismo input normalizado:

- **Clasificador:** prioriza recall; debe localizar posibles infracciones.
- **Juez:** prioriza precision; debe abstenerse si no puede probar la infraccion con evidencia del input.

Las solicitudes pueden correr en paralelo dentro de una cola de moderacion limitada. El juez usa prompt y version propios, aunque comparta modelo y proveedor. No ve ninguna salida del clasificador.

### Contrato estructurado

Cada llamada devuelve conceptualmente:

```ts
type ModerationLabel =
  | "allow"
  | "job_offer"
  | "malicious"
  | "selfpromo"
  | "abstain";

interface ModelEvaluation {
  outcome: "allow" | "violation" | "abstain";
  confidence: number;
  targets: Array<{
    candidateIndex: number;
    label: Exclude<ModerationLabel, "allow" | "abstain">;
    evidence: Array<{
      quote: string;
      policyTag: string;
    }>;
  }>;
  reason: string;
}
```

El servidor mapea indices sinteticos a IDs Discord. El modelo nunca puede proponer un ID arbitrario.

Una salida es invalida cuando ocurre cualquiera de estos casos:

- JSON o estructura invalidos.
- Indice inexistente o repetido.
- Etiqueta no permitida por la feature.
- `violation` sin target o sin evidencia.
- Cita que no existe, tras normalizar espacios, dentro del mensaje objetivo.
- Confianza fuera de `[0, 1]`.
- `allow` con targets infractores.

### Adjudicador determinista

El adjudicador es una funcion pura. No hace llamadas IA ni ejecuta Discord.

Existe acuerdo positivo solo si ambas salidas validas tienen:

- `outcome=violation`.
- Mismo conjunto exacto de targets.
- Misma etiqueta por target.
- Evidencia valida tomada del mismo target; las citas no tienen que ser identicas.
- Confianza de cada salida por encima del umbral de la feature.

Existe acuerdo negativo automatico cuando ambas salidas validas devuelven `allow` con confianza `>=0.80`. Un `allow` con menor confianza se registra como excepcion sin accion. Cualquier otro resultado es desacuerdo, abstencion o fallo tecnico.

### Persistencia y revision

Se separan evaluacion inmutable y workflow humano:

- `moderation_runs`: trigger, feature, modo, reporte, salidas completas, estados, modelos, versiones de prompt, tokens, latencias y decision final.
- `moderation_targets`: snapshot por candidato, contenido, adjuntos, resultado adjudicado, accion y seleccion de auditoria.
- `moderation_feedback`: confirmacion o correccion estructurada, veredicto esperado, motivo humano y reviewer.
- `ai_mod_cases` y `job_guard_cases`: permanecen como workflow compatible y enlazan al target nuevo.

Cada target revisable genera su propio caso. Varias acciones contra el mismo autor pueden compartir run y timeout, pero nunca comparten una etiqueta humana ambigua.

## Flujo de `job-guard`

1. Mensaje entra al canal configurado.
2. Gates baratos validan guild, autor, permisos, contenido y configuracion.
3. Se guarda snapshot del unico mensaje candidato.
4. Clasificador y juez reciben mismas reglas y mismo mensaje.
5. Adjudicador aplica matriz de `job-guard`.
6. Run y target se persisten.
7. Coordinador ejecuta borrado si corresponde.
8. Acuerdo automatico va al digest; excepcion se envia inmediatamente.

| Resultado | Accion |
|---|---|
| Ambos `job_offer`, mismo target, confianza `>=0.85` | Eliminar, autocerrar, digest |
| Ambos `allow`, confianza `>=0.80` | No actuar, registrar, posible auditoria 5% |
| Ambos `allow`, alguna confianza `<0.80` | No actuar, excepcion inmediata |
| Desacuerdo, baja confianza o abstencion | Conservar mensaje, excepcion inmediata |
| Una llamada falla y otra detecta infraccion | Conservar mensaje, excepcion inmediata |
| Ambas llamadas fallan | No actuar, registrar incidente tecnico |

`enforceJobGuard` deja de bloquear secuencialmente el resto de `messageCreate`; la evaluacion corre en background con manejo explicito de errores.

## Flujo de `ai-mod`

### Con reply

El mensaje referenciado es el unico target. Ambos modelos reciben:

- Contenido y adjuntos del target.
- Texto del reporte que menciona `@staff`.
- Reglas de scam y selfpromo.

### Sin reply

El collector obtiene reporte y contexto reciente numerado. Los modelos deben seleccionar el target mediante `candidateIndex`. El reporte forma parte del input para que la seleccion responda a su intencion, no a una busqueda independiente de cualquier mensaje sospechoso.

Solo un conjunto exacto de targets coincidente puede autoactuar. Si ambos modelos apuntan a autores o mensajes distintos, no se sanciona a ninguno automaticamente.

### Matriz de texto

| Resultado | Accion |
|---|---|
| Ambos misma infraccion/target, confianza `>=0.90` | Eliminar + timeout 24h, autocerrar, digest |
| Ambos `allow`, confianza `>=0.80` | No actuar, registrar, posible auditoria 5% |
| Ambos `allow`, alguna confianza `<0.80` | No actuar, excepcion inmediata |
| Desacuerdo con target inequivoco y una salida infractora valida `>=0.90` | Eliminar + timeout 1h, excepcion inmediata |
| Misma infraccion/target, ambas confianzas `>=0.70` pero alguna `<0.90` | Eliminar + timeout 1h, excepcion inmediata |
| Misma infraccion/target pero alguna confianza `<0.70` | No actuar, excepcion inmediata |
| Targets diferentes | No actuar, excepcion inmediata |
| Una llamada falla y otra aporta target, evidencia y confianza `>=0.90` | Eliminar + timeout 1h, excepcion inmediata |
| Ambas llamadas fallan | No actuar, registrar incidente tecnico |

Un target es inequivoco cuando el reporte es reply, o cuando una salida valida identifica un unico target y la otra salida no identifica un target conflictivo. Una salida invalida nunca puede aportar target.

El fallback actual que sanciona todos los candidatos con confianza `0` se elimina.

### Bypass de selfpromo

El bypass configurado por canal sigue siendo una regla determinista posterior a clasificacion y anterior a acciones. `IgnoredChannelsService` se consulta como gate antes de recopilar contexto o llamar al modelo.

## Politica de imagenes

Esta fase no agrega vision multimodal.

| Imagen | Accion |
|---|---|
| Hash ya confirmado en blocklist | Accion determinista existente y registro en digest |
| Hash desconocido del mismo autor en 3 o mas canales | Borrar coincidencias + timeout 1h + excepcion inmediata |
| Hash desconocido aislado, sin texto clasificable | No timeout automatico; excepcion con preview |
| Imagen con texto clasificable | Texto pasa por evaluacion dual; imagen queda como adjunto de evidencia |

Una imagen desconocida solo entra al blocklist despues de confirmacion humana de la infraccion. Corregir como legitima garantiza que no se promueva. Acuerdos entre modelos y propagacion entre canales no bastan para curar el hash.

## Presentacion al staff

### Tarjeta inmediata

Toda excepcion o auditoria muestra:

1. Contenido del mensaje objetivo, capturado antes del borrado.
2. Preview de primera imagen y lista de adjuntos.
3. Texto del reporte que menciono a staff, cuando exista.
4. Veredicto, confianza, evidencia y razon del clasificador.
5. Veredicto, confianza, evidencia y razon del juez.
6. Accion aplicada y tiempo restante de timeout temporal.
7. Feature, caso, estado y version de politica.

Ejemplo:

```text
Autopromocion no permitida

Mensaje eliminado
> Vendo hosting Stelar Cloud...
> https://...

Adjuntos
imagen.png - copia disponible en esta alerta

Reporte
> @staff revisen esto

Clasificador
SELFPROMO - 95% - evidencia: "Vendo hosting"

Juez
SELFPROMO - 92% - evidencia: "servicio propio"

Accion
Timeout 24h + mensaje eliminado

Caso
#22 - pendiente de revision
```

El contenido usa descripcion del embed hasta el limite seguro. Si se trunca, la tarjeta lo indica y el snapshot completo queda disponible mediante comando de caso. Adjuntos pequenos se descargan antes de actuar y se vuelven a adjuntar al log para conservar preview; adjuntos que excedan el limite guardan nombre, URL y hash disponibles.

Menciones dentro de contenido o reporte se muestran como texto neutralizado y nunca producen pings.

### Un caso por target

Si una evaluacion elimina tres mensajes del mismo autor, el timeout se ejecuta una vez, pero cada mensaje tiene snapshot, decision y feedback propios. No se usa solamente el contenido del primer mensaje para representar todo el grupo.

### Comandos

El detalle de caso muestra snapshot, reporte, ambas evaluaciones, evidencia, accion y feedback. IDs nuevos se presentan como `<feature>:<caseId>` para evitar colisiones entre tablas. `m!aimod case 22` sigue significando el caso historico `ai-mod` 22; nuevas salidas usan, por ejemplo, `m!aimod case ai-mod:22` o `m!aimod case job-guard:7`.

## Feedback humano

### Acciones

- `Confirmar decision`: acepta resultado, resuelve caso y actualiza metricas.
- `Corregir decision`: solicita etiqueta esperada y motivo humano opcional.

La correccion permite escoger `allow`, `job_offer`, `malicious` o `selfpromo` segun feature. Una correccion a `allow` remueve inmediatamente timeout temporal si sigue activo. Discord no puede restaurar el mensaje eliminado, por lo que el snapshot permanece visible para reparacion manual.

La transicion de pendiente a resuelto es atomica. Un segundo reviewer recibe estado ya resuelto en vez de ejecutar efectos otra vez.

### Permisos

Ambas features usan misma politica de reviewer:

- `ManageMessages`.
- Rol configurado como mod role.
- Usuario configurado como reviewer/notify target.

### Desacoplar resolucion de IA

Un click humano resuelve el caso incluso si proveedor IA esta caido. No existe llamada adicional obligatoria para sintetizar notas. Desaparecen `promptPending` y reintentos por fallo de generacion para casos nuevos.

Campos historicos permanecen mientras existan casos antiguos que los usan.

## Aprendizaje

### Fuente permitida

Solo una correccion humana estructurada puede convertirse en ejemplo de contexto. Se guarda:

- Snapshot objetivo.
- Etiqueta original de ambos modelos.
- Etiqueta esperada.
- Target esperado.
- Motivo humano opcional.
- Feature y version de politica.
- Reviewer y fecha.

Confirmar una decision actualiza metricas, pero no crea ejemplo textual. La unica excepcion es confirmacion humana de una imagen desconocida: puede promover su hash al blocklist determinista, sin generar prompt textual.

### Construccion de contexto

Cada clasificacion recibe como maximo 12 correcciones humanas del mismo guild y feature, balanceadas por etiqueta esperada y tipo de error. Mensajes ejemplo se delimitan como datos no confiables. Motivos humanos se presentan como anotaciones, no como instrucciones capaces de reemplazar reglas o formato.

`ai_mod_ai_prompts` y `job_guard_prompts` se conservan para historial, pero dejan de inyectarse en clasificaciones nuevas. `ai_mod_malicious_messages` historica puede usarse para backtest; el contexto online nuevo usa feedback estructurado posterior al cutover.

No se agregan ejemplos desde:

- Acuerdo clasificador/juez.
- Confianza alta.
- Digest sin revision.
- Razon generada por modelo.
- Repeticion cross-channel sin confirmacion.

### Retencion

- Runs `allow` sin feedback: 30 dias.
- Runs con accion, excepcion o auditoria: 90 dias.
- Correcciones humanas usadas como ejemplos: 365 dias, salvo eliminacion manual anterior.
- Metricas agregadas sin contenido: se conservan sin snapshot personal.

La purga diaria elimina primero snapshots expirados y conserva contadores agregados. Casos historicos anteriores al cutover mantienen su politica actual hasta migracion separada.

## Digest diario

El digest se envia al canal de logs una vez cada 24 horas por guild con actividad. Incluye:

- Evaluaciones totales.
- Autoacciones.
- Decisiones permitidas.
- Excepciones y pendientes.
- Auditorias seleccionadas.
- Fallos tecnicos y de Discord.
- Tasa de desacuerdo.
- Correcciones humanas desde el digest anterior.

Cada accion listada incluye autor, canal, accion y snippet real del mensaje. Nunca se lista solo la razon IA. Debido a limites de Discord, el digest muestra primeras entradas y enlaza al comando de detalle para el resto.

Casos autocerrados no tienen botones. La muestra de auditoria 5% si incluye botones y no produce ping individual. Excepciones siguen enviandose inmediatamente.

## Idempotencia y coordinacion

`SanctionCache` en memoria no es suficiente como garantia. El sistema persiste operaciones con claves idempotentes:

- Borrado: guild + message ID.
- Timeout: guild + author + ventana de sancion.
- Feedback: target/case + estado pendiente.

Si mismo mensaje entra por `job-guard` y `ai-mod`, ambos runs pueden existir para auditoria, pero el coordinador ejecuta cada borrado una vez y conserva accion mas fuerte ya aplicada. Ningun retry repite efectos resueltos.

## Manejo de fallos

### Proveedor IA

Cada llamada registra uno de estos estados:

- `ok`.
- `timeout`.
- `invalid_output`.
- `provider_error`.

Fallo total nunca produce accion. Un fallo parcial sigue matriz especifica de feature. La cola de moderacion impide que una rafaga consuma los tres slots globales y bloquee chatbot.

### Base de datos

Run y snapshot se guardan antes de una accion destructiva. Si falla persistencia:

- No se borra ni aplica timeout.
- Se registra error tecnico.
- Si una evaluacion valida detecto riesgo, se envia alerta sin botones con snapshot disponible en memoria.

### Discord

Borrado, timeout y envio de alerta registran exito o error por separado. Un timeout fallido no se presenta como aplicado. Una alerta fallida queda pendiente para digest/retry, sin repetir borrado o timeout.

## Observabilidad

Cada run guarda:

- Modelo efectivo de ambas llamadas.
- Versiones de prompt y politica.
- Latencia y tokens por llamada.
- Estado de parseo/validacion.
- Veredictos, targets, evidencia y confianza.
- Decision adjudicada.
- Acciones solicitadas y resultados.
- Modo de rollout.

Metricas por feature:

- Volumen evaluado.
- Acuerdo positivo y negativo.
- Desacuerdo y abstencion.
- Tasa enviada a staff.
- Correcciones sobre casos revisados.
- Precision auditada de acciones destructivas.
- Fallos de proveedor, persistencia y Discord.
- Latencia p50/p95.

Objetivos iniciales:

- Menos de 15% de evaluaciones enviadas a staff tras calibracion.
- Precision auditada de acciones destructivas `>=98%`.
- 100% de tarjetas con snapshot visible.
- Cero acciones destructivas sin run persistido.

## Modos y rollout

Cada feature soporta modo configurable:

- `shadow`: evalua y persiste sin ejecutar acciones del sistema dual. Enforcement legado continua solo despues de aplicar fixes de seguridad inmediatos: nunca sancionar por fallo total, respetar ignored channels y capturar snapshot.
- `assisted`: aplica solo acuerdos claros; mantiene visibilidad ampliada durante calibracion.
- `autonomous`: excepciones inmediatas, digest diario y auditoria 5%.

Secuencia:

1. Crear corpus de eval desde casos historicos resueltos y ejemplos curados.
2. Backtest de clasificador, juez y adjudicador.
3. Ejecutar shadow dual y comparar con decisiones actuales.
4. Activar assisted cuando precision del corpus alcance 98% para acciones destructivas.
5. Activar autonomous cuando auditoria live mantenga objetivo y tasa de revision sea aceptable.
6. Volver a `shadow` o `assisted` si correcciones o fallos superan umbral operativo.

## Compatibilidad y migracion

- No se eliminan tablas ni casos historicos.
- Alertas antiguas conservan custom IDs y handlers actuales.
- Casos nuevos enlazan `moderation_targets` y usan feedback estructurado.
- `promptPending` sigue disponible solo para resolver flujo historico.
- Comandos actuales continuan mostrando casos antiguos.
- Prompts generados existentes dejan de influir en clasificacion nueva, pero no se borran.

## Pruebas

### Unitarias

- Parser y validador rechazan indices, etiquetas, confianza y citas invalidas.
- Adjudicador cubre toda matriz por feature.
- Seleccion de objetivo cubre reply, sin reply, varios autores y objetivos conflictivos.
- Bypass e ignored channels se aplican antes de acciones.
- Idempotencia evita delete, timeout y feedback duplicados.
- Context builder usa solo correcciones humanas y balancea etiquetas.

### Integracion

- Alertas contienen mensaje, reporte y adjuntos antes del borrado.
- Cada target genera caso separado.
- Correccion a `allow` remueve timeout temporal.
- Feedback resuelve con proveedor IA caido.
- Fallo de DB impide accion destructiva.
- Fallo de Discord queda visible sin repetir efectos exitosos.
- Imagen desconocida no entra al blocklist sin confirmacion.
- Misma entrada por ambas features produce una sola accion.
- Digest incluye snippets reales, metricas y auditorias.

### Evaluacion

Un script reproducible ejecuta corpus versionado y reporta precision/recall por etiqueta, seleccion de target y matriz final de acciones. CI falla si precision de acciones destructivas cae bajo el umbral aprobado o si una regresion sanciona un target diferente al esperado.

## Riesgos aceptados

- Dos prompts sobre mismo modelo no son independencia estadistica real; reducen anclaje, pero pueden compartir sesgos.
- El timeout temporal y borrado de `ai-mod` ante desacuerdo priorizan contener posible scam; un mensaje borrado no puede restaurarse.
- Auditoria 5% estima precision, pero falsos negativos raros pueden tardar en aparecer.
- Digest y persistencia completa aumentan almacenamiento; retencion purga runs permitidos antes que correcciones humanas.

## Criterio de terminado

El cambio esta listo para modo autonomous cuando:

1. Backtest y suite automatizada pasan.
2. Shadow demuestra snapshots completos y seleccion correcta de targets.
3. Precision auditada de acciones destructivas alcanza 98%.
4. Ninguna accion ocurre por fallo total o antes de persistencia.
5. Staff puede resolver excepciones sin depender de otra llamada IA.
6. Digest diario muestra contenido suficiente para entender cada accion sin adivinar que se borro.
