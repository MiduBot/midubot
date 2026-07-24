import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.d.ts"],
  unbundle: true,
  target: "ESNEXT",
  shims: true,
  deps: {
    onlyBundle: ["dotenv"],
  },
});
