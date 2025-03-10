#!/usr/bin/env node
import chalk from "chalk";
import figlet from "figlet";
import { fromString } from "lolcatjs";
import { program } from "./program.js";

import "./commands/bulk.js";
import "./commands/single.js";
import "./commands/tsxGen.js";

const { textSync } = figlet;
const { red } = chalk;

const text = "conv3D";
const asciiBanner = textSync(text, {
  horizontalLayout: "full",
  font: "Colossal",
  width: process.stdout.columns,
  whitespaceBreak: true,
});

fromString(asciiBanner);

process.on("SIGINT", () => {
  console.error(red("\n🚨 Received SIGINT. Exiting program..."));
  process.exit(0);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
