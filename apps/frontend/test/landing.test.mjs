import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(import.meta.dirname, "..");
function renderPage(file) {
  const filename = resolve(root, file);
  const localRequire = createRequire(filename);
  const exports = {};
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  function requireModule(id) {
    if (id === "next/link")
      return {
        default: ({ children, ...props }) =>
          React.createElement("a", props, children),
      };
    if (id === "next/image")
      return {
        default: (props) => {
          const imageProps = { ...props };
          delete imageProps.priority;
          return React.createElement("img", imageProps);
        },
      };
    if (id.endsWith(".module.css"))
      return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (id.startsWith("@/")) return renderPage(`${id.slice(2)}.tsx`);
    if (id.startsWith("."))
      return renderPage(resolve(dirname(filename), `${id}.tsx`));
    if (id.startsWith("next/") || id === "server-only")
      throw new Error(`La landing pública no debe depender de ${id}`);
    return localRequire(id);
  }
  new Function("require", "exports", "module", code)(requireModule, exports, {
    exports,
  });
  return exports;
}

test("landing se renderiza sin sesión, configuración API ni peticiones al catálogo", () => {
  const originalFetch = global.fetch;
  global.fetch = () => {
    throw new Error("La landing no debe realizar peticiones");
  };
  try {
    const Home = renderPage("app/page.tsx").default;
    const html = renderToStaticMarkup(React.createElement(Home));
    assert.match(html, /Lo mejor de aquí, más cerca de ti/);
    assert.equal((html.match(/data-figma-section=/g) ?? []).length, 9);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.doesNotMatch(
      html,
      /\b\d+ productos\b|chorotega_session|Bearer |api\/products|api\/stores/,
    );
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
      assert(
        href.startsWith("#") ||
          [
            "/",
            "/login",
            "/registro",
            "/registro/cliente",
            "/registro/emprendedor",
            "/registro/repartidor",
          ].includes(href),
        href,
      );
      if (href.startsWith("#"))
        assert(html.includes(`id="${href.slice(1)}"`), href);
    }
    for (const [, src] of html.matchAll(/src="([^"]+)"/g)) {
      assert(
        src.startsWith("/landing/") ||
          [
            "/registration/chorotega-emblem.png",
            "/registration/local-crafts.png",
          ].includes(src),
      );
      assert(statSync(resolve(root, "public", src.slice(1))).size > 0, src);
    }
  } finally {
    global.fetch = originalFetch;
  }
});
