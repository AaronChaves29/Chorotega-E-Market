import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const exports = {};
new Function(
  "exports",
  ts.transpileModule(
    readFileSync(new URL("../lib/search-delay.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
)(exports);
const { scheduleSearch } = exports;

test("debounce no consulta a los 299 ms y confirma a los 300 ms", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  scheduleSearch(() => calls++);
  t.mock.timers.tick(299);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
});

test("cancelar evita confirmar una búsqueda anterior", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const cancel = scheduleSearch(() => assert.fail("Búsqueda cancelada"));
  cancel();
  t.mock.timers.tick(300);
});

test("escritura rápida confirma únicamente el último término", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const terms = [];
  const cancel = scheduleSearch(() => terms.push("ca"));
  t.mock.timers.tick(100);
  cancel();
  scheduleSearch(() => terms.push("café"));
  t.mock.timers.tick(299);
  assert.deepEqual(terms, []);
  t.mock.timers.tick(1);
  assert.deepEqual(terms, ["café"]);
});
