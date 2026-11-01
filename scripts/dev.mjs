// Starts the API and the Vite dev server together, and stops both when either exits.
import { spawn } from "node:child_process";

const children = ["@scriptecho/api", "@scriptecho/web"].map((workspace) =>
  spawn("npm", ["run", "dev", "-w", workspace], { stdio: "inherit" }));

const stop = () => children.forEach((child) => child.kill());
children.forEach((child) => child.on("exit", stop));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
