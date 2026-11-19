import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
function load(filename) {
  const local = createRequire(filename),
    exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", code)((id) => {
    if (id.startsWith("@/")) return load(resolve(root, id.slice(2) + ".ts"));
    if (id.startsWith(".")) {
      const p = resolve(dirname(filename), id);
      return load(p + (existsSync(p + ".ts") ? ".ts" : ".tsx"));
    }
    return local(id);
  }, exports);
  return exports;
}

const dates = load(resolve(root, "lib/date-time.ts"));
const { orderDate } = load(resolve(root, "lib/managed-orders.ts"));
const { deliveryDate } = load(resolve(root, "lib/courier-deliveries.ts"));
const cases = [
  ["2026-11-19T05:59:00.000Z", "18 nov 2026, 11:59 p. m."],
  ["2026-11-19T06:00:00.000Z", "19 nov 2026, 12:00 a. m."],
];

for (const [iso, expected] of cases)
  test(`creación, asignación y entrega muestran ${iso} en Costa Rica`, () => {
    for (const format of [dates.costaRicaDateTime, orderDate, deliveryDate])
      assert.equal(format(iso).replaceAll("\u00a0", " "), expected);
    assert.equal(new Date(iso).toISOString(), iso);
  });

for (const zone of ["UTC", "America/Costa_Rica", "Asia/Tokyo"])
  test(`formateador independiente de la zona del proceso: ${zone}`, () => {
    const code = ts.transpileModule(
      readFileSync(resolve(root, "lib/date-time.ts"), "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      },
    ).outputText;
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `${code}; console.log(JSON.stringify(${JSON.stringify(cases.map(([iso]) => iso))}.map(exports.costaRicaDateTime)));`,
      ],
      {
        env: { ...process.env, TZ: zone },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0);
    assert.deepEqual(
      JSON.parse(result.stdout).map((v) => v.replaceAll("\u00a0", " ")),
      cases.map(([, expected]) => expected),
    );
  });

test("offsets equivalentes conservan el instante y eventos diferentes no se igualan", () => {
  assert.equal(orderDate("2026-11-18T23:59:00-06:00"), orderDate(cases[0][0]));
  assert.notEqual(orderDate(cases[0][0]), deliveryDate(cases[1][0]));
});
