import type { Language } from "@/i18n";

export interface SubcommandHelp {
  id: string;
  name: string;
  emoji: string;
  aliases?: string[];
  usage: string;
  summary: string;
  detail: string;
  examples: string[];
  permissions: string;
  notes?: string;
  related?: string[];
}

export interface CategoryHelp {
  id: HelpCategoryId;
  name: string;
  emoji: string;
  color: number;
  shortDescription: string;
  longDescription: string;
  subcommands: SubcommandHelp[];
}

export type HelpCategoryId =
  | "images"
  | "whitelist"
  | "channels"
  | "moderation"
  | "aimod"
  | "apps"
  | "system";

export const CATEGORY_ORDER: HelpCategoryId[] = [
  "images",
  "whitelist",
  "channels",
  "moderation",
  "aimod",
  "apps",
  "system",
];

// ---------------------------------------------------------------------------
// Español
// ---------------------------------------------------------------------------
const es: CategoryHelp[] = [
  {
    id: "images",
    name: "Imágenes",
    emoji: "🖼️",
    color: 0xfee75c,
    shortDescription: "Base de imágenes y detección de duplicados",
    longDescription:
      "Gestiona la base de imágenes del servidor. Las imágenes registradas se comparan automáticamente contra los mensajes nuevos y, cuando hay coincidencia, se eliminan y se notifica en el canal de logs.",
    subcommands: [
      {
        id: "add",
        name: "images add",
        emoji: "➕",
        aliases: ["a", "+", "create"],
        usage: "{prefix}images add <nombre> [url|adjunto]",
        summary: "Registra una imagen en la base del servidor.",
        detail:
          "Descarga la imagen, calcula su fingerprint (dHash + pHash + aHash + color + dimensiones) y la guarda. Si ya existe una imagen con el mismo hash, devuelve error.",
        examples: [
          "{prefix}images add logo",
          "{prefix}images add logo https://i.imgur.com/x.png",
          "[adjuntar imagen] {prefix}images add logo",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "El nombre se guarda en minúsculas. Adjuntar la imagen al mensaje tiene prioridad sobre la URL.",
        related: ["images list", "images remove"],
      },
      {
        id: "list",
        name: "images list",
        emoji: "📋",
        aliases: ["ls", "l", "ver"],
        usage: "{prefix}images list",
        summary: "Lista las imágenes configuradas (con paginación y filtro).",
        detail:
          "Muestra todas las imágenes del servidor con su nombre, URL original y porcentaje de similitud disponible. Soporta paginación (◀ / ▶) y filtro por nombre (🔍 Filtrar).",
        examples: ["{prefix}images list"],
        permissions: "Manage Messages o whitelist",
        notes:
          "El filtro es por coincidencia parcial del nombre, sin distinguir mayúsculas.",
        related: ["images add", "images remove"],
      },
      {
        id: "remove",
        name: "images remove",
        emoji: "🗑️",
        aliases: ["rm", "del", "delete", "borrar"],
        usage: "{prefix}images remove <nombre|url|adjunto>",
        summary: "Elimina una imagen de la base.",
        detail:
          "Puedes identificarla por su nombre, por la URL exacta o adjuntando la imagen al mensaje (se calcula su hash para buscar).",
        examples: [
          "{prefix}images remove logo",
          "{prefix}images remove https://i.imgur.com/x.png",
          "[adjuntar imagen] {prefix}images remove",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "Si se elimina por hash y la imagen ya no existe, se muestra un error claro.",
        related: ["images add", "images list"],
      },
      {
        id: "check",
        name: "images check",
        emoji: "🔍",
        aliases: ["verify", "test"],
        usage: "{prefix}images check [url|adjunto]",
        summary: "Verifica si una imagen coincide con la base.",
        detail:
          "Calcula el fingerprint de la imagen y la compara con todas las almacenadas usando el ensemble (pHash + dHash + aHash + color + aspect ratio).",
        examples: [
          "{prefix}images check https://i.imgur.com/x.png",
          "[adjuntar imagen] {prefix}images check",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "Muestra el porcentaje de similitud y el desglose de distancias por hash.",
        related: ["images add", "images list"],
      },
      {
        id: "migrate",
        name: "images migrate",
        emoji: "♻️",
        aliases: ["upgrade", "migrar", "reindex"],
        usage: "{prefix}images migrate",
        summary: "Re-calcula fingerprints con el ensemble completo.",
        detail:
          "Recorre todas las imágenes del servidor, descarga cada una y vuelve a calcular el fingerprint ensemble. Útil para imágenes que se agregaron con la versión legacy (solo dHash).",
        examples: ["{prefix}images migrate"],
        permissions: "Manage Messages o whitelist",
        notes:
          "El proceso puede tardar si hay muchas imágenes. Muestra progreso en vivo.",
        related: ["images list"],
      },
    ],
  },
  {
    id: "whitelist",
    name: "Whitelist",
    emoji: "🛡️",
    color: 0x57f287,
    shortDescription: "Roles, usuarios y permisos autorizados",
    longDescription:
      "Permite autorizar miembros, roles o permisos de Discord para usar los comandos del bot sin necesidad de Manage Messages.",
    subcommands: [
      {
        id: "add",
        name: "whitelist add",
        emoji: "➕",
        usage: "{prefix}whitelist add <rol|user|permiso>",
        summary: "Agrega una entrada a la whitelist.",
        detail:
          "Acepta menciones, IDs y permisos válidos de Discord (Administrator, ManageGuild, ManageRoles, ManageChannels, ManageMessages, etc.). Si pasas un permiso, abre un menú de selección con los permisos disponibles.",
        examples: [
          "{prefix}whitelist add @Mod",
          "{prefix}whitelist add 123456789012345678",
          "{prefix}whitelist add ManageChannels",
        ],
        permissions: "Manage Messages",
        notes:
          "Los permisos se validan contra la API de Discord para evitar entradas inválidas.",
        related: ["whitelist list", "whitelist remove"],
      },
      {
        id: "list",
        name: "whitelist list",
        emoji: "📋",
        usage: "{prefix}whitelist list",
        summary: "Muestra todas las entradas activas.",
        detail:
          "Lista roles, usuarios y permisos autorizados en el servidor, con su tipo y el ID de Discord.",
        examples: ["{prefix}whitelist list"],
        permissions: "Manage Messages",
        related: ["whitelist add", "whitelist remove"],
      },
      {
        id: "remove",
        name: "whitelist remove",
        emoji: "🗑️",
        aliases: ["rm", "del", "delete", "borrar"],
        usage: "{prefix}whitelist remove <rol|user|permiso>",
        summary: "Quita una entrada de la whitelist.",
        detail:
          "Acepta menciones, IDs o el nombre exacto del permiso. Elimina la entrada correspondiente.",
        examples: [
          "{prefix}whitelist remove @Mod",
          "{prefix}whitelist remove 123456789012345678",
          "{prefix}whitelist remove ManageChannels",
        ],
        permissions: "Manage Messages",
        related: ["whitelist add", "whitelist list"],
      },
    ],
  },
  {
    id: "channels",
    name: "Canales",
    emoji: "📡",
    color: 0x5865f2,
    shortDescription: "Logs, idioma y canal one-message",
    longDescription:
      "Configura canales especiales, el idioma del bot en el servidor y el canal *one-message* (un mensaje por usuario).",
    subcommands: [
      {
        id: "log",
        name: "log",
        emoji: "📝",
        usage: "{prefix}log <#canal|id>",
        summary: "Define el canal de notificaciones de moderación.",
        detail:
          "El bot envía embeds a este canal cuando detecta duplicados, timeouts, reportes comunitarios, etc.",
        examples: [
          "{prefix}log #logs",
          "{prefix}log 123456789012345678",
        ],
        permissions: "Manage Messages o whitelist",
        notes: "El canal debe ser de texto y estar en el mismo servidor.",
        related: ["lang"],
      },
      {
        id: "lang",
        name: "lang",
        emoji: "🌐",
        aliases: ["language"],
        usage: "{prefix}lang <es|en>",
        summary: "Cambia el idioma del bot en este servidor.",
        detail:
          "Cambia todos los textos que envía el bot en este servidor: respuestas, embeds de moderación, mensajes de error.",
        examples: ["{prefix}lang es", "{prefix}lang en"],
        permissions: "Manage Messages o whitelist",
        related: ["log"],
      },
      {
        id: "unique",
        name: "unique",
        emoji: "✉️",
        usage: "{prefix}unique <set|emoji|reset>",
        summary: "Configura el canal *one-message*.",
        detail:
          "Permite designar un canal donde cada usuario solo puede tener **un mensaje** visible. Si el usuario envía otro, su mensaje anterior se elimina automáticamente.\n\n" +
          "• `{prefix}unique set <#canal|id>` — designa el canal.\n" +
          "• `{prefix}unique emoji <emoji>` — cambia el emoji de reacción.\n" +
          "• `{prefix}unique reset <usuario>` — permite a un usuario volver a escribir.",
        examples: [
          "{prefix}unique set #one-msg",
          "{prefix}unique emoji 🎉",
          "{prefix}unique reset @usuario",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "Si el bot no puede borrar el mensaje anterior, simplemente resetea al usuario.",
        related: ["linefilter"],
      },
    ],
  },
  {
    id: "moderation",
    name: "Moderación",
    emoji: "🛠️",
    color: 0xed4245,
    shortDescription: "Filtros automáticos de moderación",
    longDescription:
      "Filtros que se aplican a los mensajes nuevos en el servidor: líneas excesivas, límites de envío de enlaces por canal y bloqueo de enlaces para miembros recientes.",
    subcommands: [
      {
        id: "linefilter",
        name: "linefilter",
        emoji: "📏",
        aliases: ["lf"],
        usage:
          "{prefix}linefilter <on|off|threshold <n>|risk <n>|exempt add|remove|list|status>",
        summary: "Filtro de mensajes largos con score de riesgo.",
        detail:
          "Borra mensajes con demasiadas líneas o combinaciones sospechosas (líneas vacías masivas, caracteres repetidos, Zalgo, etc.).\n\n" +
          "• `on` / `off` — activa o desactiva el filtro en el servidor.\n" +
          "• `threshold <n>` — mínimo de líneas para evaluar (5–200).\n" +
          "• `risk <n>` — umbral de score para borrar (1–10).\n" +
          "• `exempt add|remove <#canal>` — exime un canal del filtro.\n" +
          "• `status` — muestra la configuración actual.",
        examples: [
          "{prefix}linefilter on",
          "{prefix}linefilter threshold 30",
          "{prefix}linefilter exempt add #general",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "El bot debe tener Manage Messages y Moderate Members en los canales donde se aplica.",
        related: ["linkcooldown", "unique"],
      },
      {
        id: "linkcooldown",
        name: "linkcooldown",
        emoji: "🔗",
        aliases: ["linkcd", "lc"],
        usage:
          "{prefix}linkcooldown <add|remove|mode|max|window|enable|disable|list|status|reset>",
        summary: "Limita los enlaces por canal.",
        detail:
          "Aplica un cooldown configurable a los enlaces enviados en un canal.\n\n" +
          "• `add <#canal> [same|any] [max] [window]` — añade el cooldown.\n" +
          "• `remove <#canal>` — lo elimina.\n" +
          "• `mode <#canal> <same|any>` — `same` cuenta duplicados, `any` cuenta todos los enlaces.\n" +
          "• `max <#canal> <n>` — número máximo de enlaces (1–50).\n" +
          "• `window <#canal> <duration>` — ventana de tiempo (ej: `30m`, `2h`, `1d`).\n" +
          "• `enable|disable <#canal>` — pausa o reactiva sin perder la config.\n" +
          "• `status <#canal>` — muestra la config actual.\n" +
          "• `reset <#canal> <user>` — limpia el historial del usuario.",
        examples: [
          "{prefix}linkcooldown add #general same 3 30m",
          "{prefix}linkcooldown max #general 5",
          "{prefix}linkcooldown status #general",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "Los formatos de duración aceptados son: `30s`, `5m`, `2h`, `1d`. Máximo 30 días.",
        related: ["linefilter", "unique"],
      },
      {
        id: "linknewcomer",
        name: "linknewcomer",
        emoji: "🆕",
        aliases: ["linknew", "ln"],
        usage:
          "{prefix}linknewcomer <on|off|threshold <duracion>|status>",
        summary: "Bloquea enlaces de miembros recientes.",
        detail:
          "Borra los mensajes que contengan enlaces enviados por miembros que se unieron al servidor hace menos tiempo que el umbral configurado.\n\n" +
          "• `on` / `off` — activa o desactiva el filtro.\n" +
          "• `threshold <duracion>` — tiempo mínimo desde la unión al servidor para permitir enlaces (ej: `1d`, `7d`, `30d`).\n" +
          "• `status` — muestra la configuración actual.\n\n" +
          "Respeta la lista de canales ignorados de `ignorechannel`.",
        examples: [
          "{prefix}linknewcomer on",
          "{prefix}linknewcomer threshold 7d",
          "{prefix}linknewcomer status",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "La duración debe estar entre 1 minuto y 365 días. Por defecto se ignoran canales marcados con `ignorechannel`.",
        related: ["linkcooldown", "linefilter"],
      },
      {
        id: "note",
        name: "note",
        emoji: "📝",
        aliases: ["notes", "n"],
        usage: "{prefix}note <add|list|remove>",
        summary: "Notas de moderación sobre usuarios.",
        detail:
          "Permite a los moderadores dejar notas internas sobre usuarios.\n\n" +
          "• `{prefix}note add <@usuario|id> <texto>` — añade una nota.\n" +
          "• `{prefix}note list <@usuario|id>` — lista las notas del usuario.\n" +
          "• `{prefix}note remove <id>` — elimina una nota por su ID.",
        examples: [
          "{prefix}note add @usuario Spamea en general",
          "{prefix}note list @usuario",
          "{prefix}note remove 5",
        ],
        permissions: "Manage Messages o whitelist",
        notes:
          "También disponible como menú contextual: clic derecho en mensaje o usuario → Apps → Añadir Nota.",
        related: ["history", "stats"],
      },
      {
        id: "history",
        name: "history",
        emoji: "📜",
        aliases: ["hist"],
        usage: "{prefix}history <@usuario|id>",
        summary: "Historial de acciones de moderación de un usuario.",
        detail:
          "Muestra todas las acciones automáticas y manuales registradas contra un usuario (puff, reportes, duplicados, filtros) junto con el número de notas.",
        examples: [
          "{prefix}history @usuario",
          "{prefix}history 123456789012345678",
        ],
        permissions: "Manage Messages o whitelist",
        related: ["note", "stats"],
      },
      {
        id: "stats",
        name: "stats",
        emoji: "📊",
        aliases: ["st"],
        usage: "{prefix}stats",
        summary: "Estadísticas de moderación de la última semana.",
        detail:
          "Muestra un resumen de acciones de moderación: desglose por tipo, top usuarios más moderados y comparativa con la semana anterior.",
        examples: ["{prefix}stats"],
        permissions: "Manage Messages o whitelist",
        related: ["history", "note"],
      },
    ],
  },
  {
    id: "aimod",
    name: "Moderación IA",
    emoji: "🤖",
    color: 0x9b59b6,
    shortDescription: "Detección de spam/estafas con IA al mencionar @mod",
    longDescription:
      "Sistema de moderación con IA. Cuando alguien menciona un rol de moderador configurado, el bot analiza el mensaje denunciado (o los últimos 10 del canal) con un LLM para detectar estafas, spam y autopromoción no deseada. Aplica timeout de 24h a los infractores y avisa a los moderadores con botones de Correcto/Incorrecto para que el modelo aprenda de los errores.",
    subcommands: [
      {
        id: "aimod",
        name: "aimod",
        emoji: "⚡",
        aliases: ["aimod"],
        usage: "{prefix}aimod <on|off|status|cases [pending|resolved|all] [página]|case <id>>",
        summary: "Activa, desactiva, consulta estado o lista casos de la moderación IA.",
        detail:
          "• `{prefix}aimod on` — activa el feature en este servidor.\n" +
          "• `{prefix}aimod off` — lo desactiva.\n" +
          "• `{prefix}aimod status` — muestra si está activado.\n" +
          "• `{prefix}aimod cases [pending|resolved|all] [página]` — lista casos (default: pending).\n" +
          "• `{prefix}aimod case <id>` — detalle de un caso.\n\n" +
          "El feature solo actúa cuando está activado **y** las variables de entorno de la IA están configuradas. " +
          "Correcto/Incorrecto no cierra el caso hasta generar el prompt de aprendizaje; si la IA falla, reintenta el botón.",
        examples: [
          "{prefix}aimod on",
          "{prefix}aimod status",
          "{prefix}aimod cases",
          "{prefix}aimod case 42",
        ],
        permissions: "Manage Guild",
        notes:
          "Requiere haber configurado al menos un rol de mod con `modrole` para que las menciones disparen el análisis.",
        related: ["modrole", "notify"],
      },
      {
        id: "modrole",
        name: "modrole",
        emoji: "🎭",
        aliases: ["modroles"],
        usage: "{prefix}modrole <add|remove> <@rol>",
        summary: "Designa qué roles disparan el análisis al ser mencionados.",
        detail:
          "Cuando un usuario menciona (`@rol`) uno de los roles registrados, el bot analiza el mensaje reply-ado o los últimos 10 mensajes del canal. Puedes asignar varios roles por servidor.\n\n" +
          "• `{prefix}modrole add <@rol>` — registra el rol.\n" +
          "• `{prefix}modrole remove <@rol>` — lo quita.",
        examples: ["{prefix}modrole add @Moderador", "{prefix}modrole remove @Moderador"],
        permissions: "Manage Guild",
        notes: "Acepta también el ID numérico del rol en lugar de la mención.",
        related: ["aimod", "notify"],
      },
      {
        id: "notify",
        name: "notify",
        emoji: "🔔",
        aliases: ["notif"],
        usage: "{prefix}notify <add|remove> <@usuario|@rol>",
        summary: "Define a quiénes se avisa (ping) en cada alerta de moderación IA.",
        detail:
          "Cada vez que el bot detecta spam/estafa o emite una alerta de precaución, menciona a estos usuarios y/o roles en el canal de logs.\n\n" +
          "• `{prefix}notify add <@usuario|@rol>` — añade un destinatario.\n" +
          "• `{prefix}notify remove <@usuario|@rol>` — lo quita.",
        examples: ["{prefix}notify add @Admin", "{prefix}notify add @Soporte"],
        permissions: "Manage Guild",
        notes: "Si no hay destinatarios, las alertas se envían igual pero sin ping.",
        related: ["aimod", "log"],
      },
      {
        id: "selfpromochannel",
        name: "selfpromochannel",
        emoji: "📢",
        aliases: ["spc", "selfpromo"],
        usage: "{prefix}selfpromochannel <add|remove> <#canal>",
        summary: "Canales donde la autopromoción válida (YouTube/LinkedIn/X-IG) está permitida.",
        detail:
          "La autopromoción solo se permite si es un enlace a YouTube, LinkedIn, X o Instagram **y** se envía en uno de estos canales designados (bypass). Fuera de estos canales, o si la autopromoción es de otra plataforma (Telegram, web propia, venta de curso, etc.), se aplica timeout igual.\n\n" +
          "• `{prefix}selfpromochannel add <#canal>` — añade un canal de bypass.\n" +
          "• `{prefix}selfpromochannel remove <#canal>` — lo quita.",
        examples: ["{prefix}selfpromochannel add #self-promo"],
        permissions: "Manage Guild",
        notes: "El bypass valida tanto el canal como el tipo de plataforma.",
        related: ["aimod"],
      },
      {
        id: "ignorechannel",
        name: "ignorechannel",
        emoji: "🚫",
        aliases: ["ignorech", "ic"],
        usage: "{prefix}ignorechannel <add|remove> <#canal|id-categoria>",
        summary: "Canales/categorías que puff, el automod de imágenes y la IA ignoran.",
        detail:
          "Útil para canales read-only o categorías donde no tiene sentido analizar mensajes. El bot ignora el canal si su ID o el ID de su categoría padre están en esta lista. Lo comparten puff, monitorImages y la moderación IA.\n\n" +
          "• `{prefix}ignorechannel add <#canal>` — ignora un canal.\n" +
          "• `{prefix}ignorechannel add <id-categoria>` — ignora toda una categoría.\n" +
          "• `{prefix}ignorechannel remove <#canal|id>` — deja de ignorarlo.",
        examples: ["{prefix}ignorechannel add #anuncios", "{prefix}ignorechannel add 123456789012345678"],
        permissions: "Manage Guild",
        notes: "Una mención de canal se guarda como tipo `channel`; un ID crudo se guarda como `category`.",
        related: ["aimod"],
      },
    ],
  },
  {
    id: "apps",
    name: "Apps (Context Menu)",
    emoji: "🧩",
    color: 0xeb459e,
    shortDescription: "Comandos del menú contextual de mensajes",
    longDescription:
      "Acciones disponibles haciendo clic derecho sobre un mensaje → **Apps**. Estas acciones no usan prefijo; se invocan directamente desde el mensaje.",
    subcommands: [
      {
        id: "Reportar",
        name: "Reportar",
        emoji: "🚩",
        usage: "Clic derecho en un mensaje → Apps → Reportar",
        summary: "Abre un reporte comunitario sobre el mensaje.",
        detail:
          "Al alcanzar **3 reportes** sobre el mismo mensaje:\n" +
          "• Se elimina el mensaje.\n" +
          "• Se aplica timeout de 24h al autor.\n" +
          "• Se barren coincidencias (texto o imagen) en otros canales y se eliminan.\n" +
          "• Se envía un embed resumen al canal de logs.",
        examples: ["Reporte: spam → 1/3 → 2/3 → 🚨"],
        permissions: "Cualquier usuario (no se puede reportar a sí mismo ni a bots)",
        notes:
          "Los reportes expiran a los 30 minutos. Cada usuario puede reportar una vez por mensaje.",
        related: ["Puff"],
      },
      {
        id: "Puff",
        name: "Puff",
        emoji: "💨",
        usage: "Clic derecho en un mensaje → Apps → Puff",
        summary: "Acción rápida de moderación.",
        detail:
          "Para moderadores con `Manage Messages`:\n" +
          "1. Agrega todas las imágenes del mensaje a la base (incluyendo URLs).\n" +
          "2. Banea al autor con `deleteMessageSeconds: 86400` (24h de mensajes borrados).\n" +
          "3. Lo desbanea 1 segundo después (temp-ban invisible para el usuario).",
        examples: ["Imagen duplicada detectada → Apps → Puff 💨"],
        permissions: "Manage Messages (en el servidor)",
        notes:
          "Si el mensaje no tiene imágenes, el comando responde con un error y no ejecuta el ban.",
        related: ["images add", "Reportar"],
      },
      {
        id: "AñadirNota",
        name: "Añadir Nota",
        emoji: "📝",
        usage: "Clic derecho en un mensaje o usuario → Apps → Añadir Nota",
        summary: "Añade una nota de moderación sobre el usuario.",
        detail:
          "Abre un modal para escribir una nota interna sobre el autor del mensaje o el usuario seleccionado. Las notas quedan registradas y se pueden consultar con `{prefix}note list` o `{prefix}history`.",
        examples: ["Mensaje sospechoso → Apps → Añadir Nota → escribir nota"],
        permissions: "Manage Messages",
        notes:
          "Disponible tanto en mensajes como en usuarios (clic derecho en la mención).",
        related: ["note", "history"],
      },
    ],
  },
  {
    id: "system",
    name: "Sistema",
    emoji: "⚙️",
    color: 0x99aab5,
    shortDescription: "Información del bot y ayuda",
    longDescription: "Comandos de utilidad sobre el propio bot.",
    subcommands: [
      {
        id: "help",
        name: "help",
        emoji: "📖",
        aliases: ["h", "?"],
        usage: "{prefix}help",
        summary: "Abre este panel de ayuda interactivo.",
        detail:
          "Muestra este menú con todas las categorías y subcomandos. Usa el menú desplegable para navegar y los botones para volver o cerrar.",
        examples: ["{prefix}help", "{prefix}h", "{prefix}?"],
        permissions: "Manage Messages (único comando restringido)",
        notes:
          "Los botones y el menú del panel están vinculados a tu usuario: nadie más puede operarlos.",
        related: ["version"],
      },
      {
        id: "version",
        name: "version",
        emoji: "🤖",
        aliases: ["v", "ver"],
        usage: "{prefix}version",
        summary: "Muestra la versión del bot.",
        detail:
          "Embed con el nombre y la versión actual del bot, además de la versión de Node en ejecución.",
        examples: ["{prefix}version"],
        permissions: "Manage Messages o whitelist",
        related: ["help"],
      },
      {
        id: "ai",
        name: "ai",
        emoji: "💬",
        usage: "{prefix}ai <on|off|channel|status|test>",
        summary: "Chatbot de IA en un canal (apagado por defecto).",
        detail:
          "El bot puede hablar como un usuario más: rompe el silencio (~15 min) en el canal configurado, sigue el hilo un rato y responde si lo mencionan en cualquier canal.\n\n" +
          "• `{prefix}ai on` / `{prefix}ai off` — activar o desactivar (por defecto off).\n" +
          "• `{prefix}ai channel <#canal>` — canal donde rompe el silencio.\n" +
          "• `{prefix}ai channel off` — quitar el canal (no desactiva el chat).\n" +
          "• `{prefix}ai status` — ver si está activo y qué canal hay.\n" +
          "• `{prefix}ai test` — probar la conexión con el modelo (solo superdev).",
        examples: [
          "{prefix}ai on",
          "{prefix}ai channel #general",
          "{prefix}ai status",
          "{prefix}ai off",
        ],
        permissions: "Manage Messages o whitelist (`test` solo superdev)",
        notes:
          "Sin canal, con `on` solo responde a menciones o replies. No responde si el mensaje menciona un rol de mods (eso lo lleva aimod).",
        related: ["aimod"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Inglés
// ---------------------------------------------------------------------------
const en: CategoryHelp[] = [
  {
    id: "images",
    name: "Images",
    emoji: "🖼️",
    color: 0xfee75c,
    shortDescription: "Image database and duplicate detection",
    longDescription:
      "Manage the server's image database. Registered images are automatically compared against new messages; when a match is detected the message is deleted and a notification is posted to the log channel.",
    subcommands: [
      {
        id: "add",
        name: "images add",
        emoji: "➕",
        aliases: ["a", "+", "create"],
        usage: "{prefix}images add <name> [url|attachment]",
        summary: "Register an image in the server database.",
        detail:
          "Downloads the image, computes its fingerprint (dHash + pHash + aHash + color + dimensions) and stores it. Errors if an image with the same hash already exists.",
        examples: [
          "{prefix}images add logo",
          "{prefix}images add logo https://i.imgur.com/x.png",
          "[attach image] {prefix}images add logo",
        ],
        permissions: "Manage Messages or whitelist",
        notes: "The name is stored lowercase. Attachments take priority over URLs.",
        related: ["images list", "images remove"],
      },
      {
        id: "list",
        name: "images list",
        emoji: "📋",
        aliases: ["ls", "l", "ver"],
        usage: "{prefix}images list",
        summary: "List configured images (with pagination & filter).",
        detail:
          "Shows every image registered on the server with name, original URL and similarity. Supports pagination (◀ / ▶) and a name filter (🔍 Filter).",
        examples: ["{prefix}images list"],
        permissions: "Manage Messages or whitelist",
        notes: "The filter is a case-insensitive partial match on the name.",
        related: ["images add", "images remove"],
      },
      {
        id: "remove",
        name: "images remove",
        emoji: "🗑️",
        aliases: ["rm", "del", "delete", "borrar"],
        usage: "{prefix}images remove <name|url|attachment>",
        summary: "Remove an image from the database.",
        detail:
          "Identify the image by its name, exact URL or by attaching it to the message (its hash will be computed and used to find the entry).",
        examples: [
          "{prefix}images remove logo",
          "{prefix}images remove https://i.imgur.com/x.png",
          "[attach image] {prefix}images remove",
        ],
        permissions: "Manage Messages or whitelist",
        related: ["images add", "images list"],
      },
      {
        id: "check",
        name: "images check",
        emoji: "🔍",
        aliases: ["verify", "test"],
        usage: "{prefix}images check [url|attachment]",
        summary: "Check if an image matches any stored one.",
        detail:
          "Computes the image fingerprint and compares it with the stored ones using the ensemble (pHash + dHash + aHash + color + aspect ratio).",
        examples: [
          "{prefix}images check https://i.imgur.com/x.png",
          "[attach image] {prefix}images check",
        ],
        permissions: "Manage Messages or whitelist",
        notes:
          "Shows the similarity percentage and the per-hash distance breakdown.",
        related: ["images add", "images list"],
      },
      {
        id: "migrate",
        name: "images migrate",
        emoji: "♻️",
        aliases: ["upgrade", "migrar", "reindex"],
        usage: "{prefix}images migrate",
        summary: "Re-compute fingerprints with the full ensemble.",
        detail:
          "Iterates over every image in the server, downloads it and re-computes the ensemble fingerprint. Useful for images added with the legacy version (dHash only).",
        examples: ["{prefix}images migrate"],
        permissions: "Manage Messages or whitelist",
        notes: "May take a while on large databases. Live progress is reported.",
        related: ["images list"],
      },
    ],
  },
  {
    id: "whitelist",
    name: "Whitelist",
    emoji: "🛡️",
    color: 0x57f287,
    shortDescription: "Authorized roles, users and permissions",
    longDescription:
      "Authorize members, roles or Discord permissions to use the bot commands without needing Manage Messages.",
    subcommands: [
      {
        id: "add",
        name: "whitelist add",
        emoji: "➕",
        usage: "{prefix}whitelist add <role|user|permission>",
        summary: "Add an entry to the whitelist.",
        detail:
          "Accepts mentions, IDs and valid Discord permissions (Administrator, ManageGuild, ManageRoles, ManageChannels, ManageMessages, etc.). If you pass a permission, a select menu opens with the available options.",
        examples: [
          "{prefix}whitelist add @Mod",
          "{prefix}whitelist add 123456789012345678",
          "{prefix}whitelist add ManageChannels",
        ],
        permissions: "Manage Messages",
        notes: "Permissions are validated against the Discord API.",
        related: ["whitelist list", "whitelist remove"],
      },
      {
        id: "list",
        name: "whitelist list",
        emoji: "📋",
        usage: "{prefix}whitelist list",
        summary: "Show all active entries.",
        detail:
          "Lists the roles, users and permissions authorized on the server with their type and Discord ID.",
        examples: ["{prefix}whitelist list"],
        permissions: "Manage Messages",
        related: ["whitelist add", "whitelist remove"],
      },
      {
        id: "remove",
        name: "whitelist remove",
        emoji: "🗑️",
        aliases: ["rm", "del", "delete", "borrar"],
        usage: "{prefix}whitelist remove <role|user|permission>",
        summary: "Remove an entry from the whitelist.",
        detail:
          "Accepts mentions, IDs or the exact permission name. Removes the matching entry.",
        examples: [
          "{prefix}whitelist remove @Mod",
          "{prefix}whitelist remove 123456789012345678",
          "{prefix}whitelist remove ManageChannels",
        ],
        permissions: "Manage Messages",
        related: ["whitelist add", "whitelist list"],
      },
    ],
  },
  {
    id: "channels",
    name: "Channels",
    emoji: "📡",
    color: 0x5865f2,
    shortDescription: "Logs, language and one-message channel",
    longDescription:
      "Configure special channels, the bot's language in the server and the *one-message* channel (one message per user).",
    subcommands: [
      {
        id: "log",
        name: "log",
        emoji: "📝",
        usage: "{prefix}log <#channel|id>",
        summary: "Set the moderation notifications channel.",
        detail:
          "The bot posts embeds here for duplicate detections, timeouts, community reports, etc.",
        examples: [
          "{prefix}log #logs",
          "{prefix}log 123456789012345678",
        ],
        permissions: "Manage Messages or whitelist",
        notes: "The channel must be a text channel in the same server.",
        related: ["lang"],
      },
      {
        id: "lang",
        name: "lang",
        emoji: "🌐",
        aliases: ["language"],
        usage: "{prefix}lang <es|en>",
        summary: "Change the bot's language in this server.",
        detail:
          "Switches every text the bot sends in the server: replies, moderation embeds, error messages.",
        examples: ["{prefix}lang es", "{prefix}lang en"],
        permissions: "Manage Messages or whitelist",
        related: ["log"],
      },
      {
        id: "unique",
        name: "unique",
        emoji: "✉️",
        usage: "{prefix}unique <set|emoji|reset>",
        summary: "Configure the *one-message* channel.",
        detail:
          "Designate a channel where each user can only have **one** visible message. If the user sends another, their previous message is deleted automatically.\n\n" +
          "• `{prefix}unique set <#channel|id>` — set the channel.\n" +
          "• `{prefix}unique emoji <emoji>` — change the reaction emoji.\n" +
          "• `{prefix}unique reset <user>` — let a user send again.",
        examples: [
          "{prefix}unique set #one-msg",
          "{prefix}unique emoji 🎉",
          "{prefix}unique reset @user",
        ],
        permissions: "Manage Messages or whitelist",
        notes: "If the bot can't delete the previous message, the user is simply reset.",
        related: ["linefilter"],
      },
    ],
  },
  {
    id: "moderation",
    name: "Moderation",
    emoji: "🛠️",
    color: 0xed4245,
    shortDescription: "Automatic moderation filters",
    longDescription:
      "Filters applied to new messages: excessive lines, per-channel link limits and blocking links from new members.",
    subcommands: [
      {
        id: "linefilter",
        name: "linefilter",
        emoji: "📏",
        aliases: ["lf"],
        usage:
          "{prefix}linefilter <on|off|threshold <n>|risk <n>|exempt add|remove|list|status>",
        summary: "Long-message filter with a risk score.",
        detail:
          "Deletes messages with too many lines or suspicious patterns (massive empty lines, repeated chars, Zalgo, etc.).\n\n" +
          "• `on` / `off` — enable or disable the filter.\n" +
          "• `threshold <n>` — minimum number of lines to evaluate (5–200).\n" +
          "• `risk <n>` — risk score threshold to delete (1–10).\n" +
          "• `exempt add|remove <#channel>` — exempt a channel.\n" +
          "• `status` — show current configuration.",
        examples: [
          "{prefix}linefilter on",
          "{prefix}linefilter threshold 30",
          "{prefix}linefilter exempt add #general",
        ],
        permissions: "Manage Messages or whitelist",
        notes:
          "The bot needs Manage Messages and Moderate Members in the target channels.",
        related: ["linkcooldown", "unique"],
      },
      {
        id: "linkcooldown",
        name: "linkcooldown",
        emoji: "🔗",
        aliases: ["linkcd", "lc"],
        usage:
          "{prefix}linkcooldown <add|remove|mode|max|window|enable|disable|list|status|reset>",
        summary: "Cap links per channel.",
        detail:
          "Applies a configurable cooldown to links sent in a channel.\n\n" +
          "• `add <#channel> [same|any] [max] [window]` — add the cooldown.\n" +
          "• `remove <#channel>` — remove it.\n" +
          "• `mode <#channel> <same|any>` — `same` counts duplicates, `any` counts all links.\n" +
          "• `max <#channel> <n>` — max links (1–50).\n" +
          "• `window <#channel> <duration>` — time window (e.g. `30m`, `2h`, `1d`).\n" +
          "• `enable|disable <#channel>` — pause or resume without losing config.\n" +
          "• `status <#channel>` — show current config.\n" +
          "• `reset <#channel> <user>` — clear the user's history.",
        examples: [
          "{prefix}linkcooldown add #general same 3 30m",
          "{prefix}linkcooldown max #general 5",
          "{prefix}linkcooldown status #general",
        ],
        permissions: "Manage Messages or whitelist",
        notes:
          "Accepted duration formats: `30s`, `5m`, `2h`, `1d`. Maximum 30 days.",
        related: ["linefilter", "unique"],
      },
      {
        id: "linknewcomer",
        name: "linknewcomer",
        emoji: "🆕",
        aliases: ["linknew", "ln"],
        usage:
          "{prefix}linknewcomer <on|off|threshold <duration>|status>",
        summary: "Blocks links from new members.",
        detail:
          "Deletes messages containing links posted by members who joined the server more recently than the configured threshold.\n\n" +
          "• `on` / `off` — enable or disable the filter.\n" +
          "• `threshold <duration>` — minimum time since joining the server to allow links (e.g. `1d`, `7d`, `30d`).\n" +
          "• `status` — shows current configuration.\n\n" +
          "Respects the `ignorechannel` ignore list.",
        examples: [
          "{prefix}linknewcomer on",
          "{prefix}linknewcomer threshold 7d",
          "{prefix}linknewcomer status",
        ],
        permissions: "Manage Messages or whitelist",
        notes:
          "Duration must be between 1 minute and 365 days. By default, channels ignored via `ignorechannel` are skipped.",
        related: ["linkcooldown", "linefilter"],
      },
      {
        id: "note",
        name: "note",
        emoji: "📝",
        aliases: ["notes", "n"],
        usage: "{prefix}note <add|list|remove>",
        summary: "Moderation notes on users.",
        detail:
          "Lets moderators leave internal notes on users.\n\n" +
          "• `{prefix}note add <@user|id> <text>` — add a note.\n" +
          "• `{prefix}note list <@user|id>` — list user notes.\n" +
          "• `{prefix}note remove <id>` — remove a note by ID.",
        examples: [
          "{prefix}note add @user Spamming in general",
          "{prefix}note list @user",
          "{prefix}note remove 5",
        ],
        permissions: "Manage Messages or whitelist",
        notes:
          "Also available as a context menu: right-click a message or user → Apps → Añadir Nota.",
        related: ["history", "stats"],
      },
      {
        id: "history",
        name: "history",
        emoji: "📜",
        aliases: ["hist"],
        usage: "{prefix}history <@user|id>",
        summary: "Moderation action history for a user.",
        detail:
          "Shows all automatic and manual actions recorded against a user (puff, reports, duplicates, filters) along with the note count.",
        examples: [
          "{prefix}history @user",
          "{prefix}history 123456789012345678",
        ],
        permissions: "Manage Messages or whitelist",
        related: ["note", "stats"],
      },
      {
        id: "stats",
        name: "stats",
        emoji: "📊",
        aliases: ["st"],
        usage: "{prefix}stats",
        summary: "Moderation statistics for the last week.",
        detail:
          "Shows a moderation summary: breakdown by type, top moderated users and week-over-week comparison.",
        examples: ["{prefix}stats"],
        permissions: "Manage Messages or whitelist",
        related: ["history", "note"],
      },
    ],
  },
  {
    id: "aimod",
    name: "AI Moderation",
    emoji: "🤖",
    color: 0x9b59b6,
    shortDescription: "AI spam/scam detection triggered by @mod mentions",
    longDescription:
      "AI-powered moderation. When someone mentions a configured moderator role, the bot analyzes the reported message (or the last 10 in the channel) with an LLM to detect scams, spam and unwanted self-promotion. It applies a 24h timeout to offenders and alerts moderators with Correct/Incorrect buttons so the model learns from its mistakes.",
    subcommands: [
      {
        id: "aimod",
        name: "aimod",
        emoji: "⚡",
        aliases: ["aimod"],
        usage: "{prefix}aimod <on|off|status|cases [pending|resolved|all] [page]|case <id>>",
        summary: "Enable, disable, check status, or list AI moderation cases.",
        detail:
          "• `{prefix}aimod on` — enable the feature in this server.\n" +
          "• `{prefix}aimod off` — disable it.\n" +
          "• `{prefix}aimod status` — show whether it's enabled.\n" +
          "• `{prefix}aimod cases [pending|resolved|all] [page]` — list cases (default: pending).\n" +
          "• `{prefix}aimod case <id>` — show case detail.\n\n" +
          "The feature only acts when enabled **and** the AI environment variables are configured. " +
          "Correct/Incorrect does not resolve a case until the learning prompt is generated; if AI fails, retry the button.",
        examples: [
          "{prefix}aimod on",
          "{prefix}aimod status",
          "{prefix}aimod cases",
          "{prefix}aimod case 42",
        ],
        permissions: "Manage Guild",
        notes:
          "Requires at least one mod role configured with `modrole` for mentions to trigger analysis.",
        related: ["modrole", "notify"],
      },
      {
        id: "modrole",
        name: "modrole",
        emoji: "🎭",
        aliases: ["modroles"],
        usage: "{prefix}modrole <add|remove> <@role>",
        summary: "Designate which roles trigger analysis when mentioned.",
        detail:
          "When a user mentions (`@role`) one of the registered roles, the bot analyzes the replied message or the last 10 messages in the channel. You can assign several roles per server.\n\n" +
          "• `{prefix}modrole add <@role>` — register the role.\n" +
          "• `{prefix}modrole remove <@role>` — remove it.",
        examples: ["{prefix}modrole add @Moderator", "{prefix}modrole remove @Moderator"],
        permissions: "Manage Guild",
        notes: "Also accepts the numeric role ID instead of a mention.",
        related: ["aimod", "notify"],
      },
      {
        id: "notify",
        name: "notify",
        emoji: "🔔",
        aliases: ["notif"],
        usage: "{prefix}notify <add|remove> <@user|@role>",
        summary: "Set who gets pinged on each AI moderation alert.",
        detail:
          "Every time the bot detects spam/scam or emits a precaution alert, it mentions these users and/or roles in the log channel.\n\n" +
          "• `{prefix}notify add <@user|@role>` — add a recipient.\n" +
          "• `{prefix}notify remove <@user|@role>` — remove one.",
        examples: ["{prefix}notify add @Admin", "{prefix}notify add @Support"],
        permissions: "Manage Guild",
        notes: "With no recipients set, alerts are still sent but without a ping.",
        related: ["aimod", "log"],
      },
      {
        id: "selfpromochannel",
        name: "selfpromochannel",
        emoji: "📢",
        aliases: ["spc", "selfpromo"],
        usage: "{prefix}selfpromochannel <add|remove> <#channel>",
        summary: "Channels where valid self-promotion (YouTube/LinkedIn/X-IG) is allowed.",
        detail:
          "Self-promotion is only allowed if it links to YouTube, LinkedIn, X or Instagram **and** is posted in one of these designated channels (bypass). Outside these channels, or for other platforms (Telegram, personal site, course sales, etc.), a timeout is still applied.\n\n" +
          "• `{prefix}selfpromochannel add <#channel>` — add a bypass channel.\n" +
          "• `{prefix}selfpromochannel remove <#channel>` — remove one.",
        examples: ["{prefix}selfpromochannel add #self-promo"],
        permissions: "Manage Guild",
        notes: "The bypass validates both the channel and the platform type.",
        related: ["aimod"],
      },
      {
        id: "ignorechannel",
        name: "ignorechannel",
        emoji: "🚫",
        aliases: ["ignorech", "ic"],
        usage: "{prefix}ignorechannel <add|remove> <#channel|category-id>",
        summary: "Channels/categories that puff, the image automod and AI ignore.",
        detail:
          "Useful for read-only channels or categories where analyzing messages makes no sense. The bot ignores a channel if its ID or its parent category's ID is on this list. Shared by puff, monitorImages and AI moderation.\n\n" +
          "• `{prefix}ignorechannel add <#channel>` — ignore a channel.\n" +
          "• `{prefix}ignorechannel add <category-id>` — ignore a whole category.\n" +
          "• `{prefix}ignorechannel remove <#channel|id>` — stop ignoring it.",
        examples: ["{prefix}ignorechannel add #announcements", "{prefix}ignorechannel add 123456789012345678"],
        permissions: "Manage Guild",
        notes: "A channel mention is stored as type `channel`; a raw ID is stored as `category`.",
        related: ["aimod"],
      },
    ],
  },
  {
    id: "apps",
    name: "Apps (Context Menu)",
    emoji: "🧩",
    color: 0xeb459e,
    shortDescription: "Message context-menu commands",
    longDescription:
      "Actions available by right-clicking a message → **Apps**. These actions do not use a prefix; they are invoked directly on the target message.",
    subcommands: [
      {
        id: "Reportar",
        name: "Reportar",
        emoji: "🚩",
        usage: "Right-click a message → Apps → Reportar",
        summary: "Open a community report on the message.",
        detail:
          "When the message reaches **3 reports**:\n" +
          "• The message is deleted.\n" +
          "• The author is timed out for 24h.\n" +
          "• Cross-channel matches (text or image) are swept and deleted.\n" +
          "• A summary embed is posted to the log channel.",
        examples: ["Spam report: 1/3 → 2/3 → 🚨"],
        permissions: "Anyone (you cannot report yourself or bots)",
        notes:
          "Reports expire after 30 minutes. Each user can report a message only once.",
        related: ["Puff"],
      },
      {
        id: "Puff",
        name: "Puff",
        emoji: "💨",
        usage: "Right-click a message → Apps → Puff",
        summary: "Quick moderation action.",
        detail:
          "For moderators with `Manage Messages`:\n" +
          "1. Adds every image of the message to the database (including URLs).\n" +
          "2. Bans the author with `deleteMessageSeconds: 86400` (24h of messages deleted).\n" +
          "3. Unbans them 1 second later (invisible temp-ban).",
        examples: ["Duplicate image detected → Apps → Puff 💨"],
        permissions: "Manage Messages (server-wide)",
        notes:
          "If the message has no images, the command replies with an error and skips the ban.",
        related: ["images add", "Reportar"],
      },
      {
        id: "AñadirNota",
        name: "Añadir Nota",
        emoji: "📝",
        usage: "Right-click a message or user → Apps → Añadir Nota",
        summary: "Add a moderation note on the user.",
        detail:
          "Opens a modal to write an internal note about the message author or the selected user. Notes are stored and can be queried with `{prefix}note list` or `{prefix}history`.",
        examples: ["Suspicious message → Apps → Añadir Nota → write note"],
        permissions: "Manage Messages",
        notes:
          "Available on both messages and users (right-click a user mention).",
        related: ["note", "history"],
      },
    ],
  },
  {
    id: "system",
    name: "System",
    emoji: "⚙️",
    color: 0x99aab5,
    shortDescription: "Bot information and help",
    longDescription: "Utility commands about the bot itself.",
    subcommands: [
      {
        id: "help",
        name: "help",
        emoji: "📖",
        aliases: ["h", "?"],
        usage: "{prefix}help",
        summary: "Open this interactive help panel.",
        detail:
          "Shows this menu with every category and subcommand. Use the dropdown to navigate and the buttons to go back or close.",
        examples: ["{prefix}help", "{prefix}h", "{prefix}?"],
        permissions: "Manage Messages (the only command restricted this way)",
        notes:
          "Buttons and the dropdown are bound to your user — nobody else can operate them.",
        related: ["version"],
      },
      {
        id: "version",
        name: "version",
        emoji: "🤖",
        aliases: ["v", "ver"],
        usage: "{prefix}version",
        summary: "Show the bot version.",
        detail:
          "Embed with the bot's name and current version, plus the running Node version.",
        examples: ["{prefix}version"],
        permissions: "Manage Messages or whitelist",
        related: ["help"],
      },
      {
        id: "ai",
        name: "ai",
        emoji: "💬",
        usage: "{prefix}ai <on|off|channel|status|test>",
        summary: "AI chatbot in a channel (off by default).",
        detail:
          "The bot can talk like another user: it breaks the silence (~15 min) in the configured channel, keeps the thread going for a bit, and replies when mentioned in any channel.\n\n" +
          "• `{prefix}ai on` / `{prefix}ai off` — enable or disable (off by default).\n" +
          "• `{prefix}ai channel <#channel>` — channel where it breaks the silence.\n" +
          "• `{prefix}ai channel off` — clear the channel (does not disable chat).\n" +
          "• `{prefix}ai status` — show whether it is on and which channel is set.\n" +
          "• `{prefix}ai test` — ping the model (superdev only).",
        examples: [
          "{prefix}ai on",
          "{prefix}ai channel #general",
          "{prefix}ai status",
          "{prefix}ai off",
        ],
        permissions: "Manage Messages or whitelist (`test` is superdev-only)",
        notes:
          "With `on` and no channel, it only replies to mentions or replies. It stays quiet if the message mentions a mod role (aimod handles that).",
        related: ["aimod"],
      },
    ],
  },
];

const CATALOGS: Record<Language, CategoryHelp[]> = { es, en };

export function getCatalog(lang: Language): CategoryHelp[] {
  return CATALOGS[lang];
}

export function getCategory(
  lang: Language,
  id: HelpCategoryId,
): CategoryHelp | undefined {
  return getCatalog(lang).find((c) => c.id === id);
}

export function getSubcommand(
  lang: Language,
  cat: HelpCategoryId,
  id: string,
): SubcommandHelp | undefined {
  return getCategory(lang, cat)?.subcommands.find((s) => s.id === id);
}

export function totalSubcommands(lang: Language): number {
  return getCatalog(lang).reduce((acc, c) => acc + c.subcommands.length, 0);
}
