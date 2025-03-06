#!/usr/bin/env node
import { red } from "chalk";
import { textSync } from "figlet";
import { fromString } from "lolcatjs";
import { program } from "./program";

import "./commands/single";
import "./commands/bulk";
import "./commands/tsxGen";

const text = "conv3D";
const asciiBanner = textSync(text, {
  horizontalLayout: "full",
  font: "Colossal",
  width: process.stdout.columns,
  whitespaceBreak: true,
});

fromString(asciiBanner);

process.on("SIGINT", () => {
  console.log(red("\n🚨 Received SIGINT. Exiting program..."));
  process.exit(0);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
