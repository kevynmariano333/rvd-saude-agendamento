import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

const EH_HOOK = /^use[A-Z]/;

function nomeDaChamada(node) {
  if (node.callee?.type === "Identifier") return node.callee.name;
  if (node.callee?.type === "MemberExpression" && node.callee.property?.type === "Identifier") {
    return node.callee.property.name;
  }
  return null;
}

/**
 * Filhos de um nó do AST.
 *
 * `parent` é ignorado: ele aponta de volta para cima, e segui-lo faz a
 * recursão dar a volta na árvore até estourar a pilha.
 */
function filhos(node) {
  const lista = [];
  for (const [chave, valor] of Object.entries(node)) {
    if (chave === "parent") continue;
    if (Array.isArray(valor)) {
      for (const item of valor) if (item && typeof item.type === "string") lista.push(item);
    } else if (valor && typeof valor === "object" && typeof valor.type === "string") {
      lista.push(valor);
    }
  }
  return lista;
}

const FUNCOES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

function contemReturn(node) {
  if (node.type === "ReturnStatement") return true;
  // Um return dentro de outra função não encerra esta.
  if (FUNCOES.has(node.type)) return false;
  return filhos(node).some(contemReturn);
}

function visitarChamadas(node, aoEncontrar) {
  if (node.type === "CallExpression") aoEncontrar(node);
  for (const filho of filhos(node)) visitarChamadas(filho, aoEncontrar);
}

/**
 * Hook chamado depois de uma saída antecipada.
 *
 * A regra oficial `rules-of-hooks` só reconhece `useAlgo()` solto ou
 * `Namespace.useAlgo()`. Uma chamada como `trpc.appointments.list.useQuery()`
 * passa batido por ela — e é exatamente a forma de quase todos os hooks deste
 * projeto. Foi um hook depois de um `return` que derrubou a tela do operador
 * uma vez; esta regra existe para isso não depender de alguém lembrar.
 */
const hookDepoisDeReturn = {
  meta: {
    type: "problem",
    docs: { description: "Hook chamado depois de uma saída antecipada da função" },
    schema: [],
    messages: {
      depoisDeReturn:
        'O hook "{{nome}}" é chamado depois de um return desta função. A quantidade de hooks muda entre renderizações e a tela quebra (React #310). Mova a chamada para antes de qualquer return.',
    },
  },
  create(context) {
    function verificar(node) {
      if (node.body?.type !== "BlockStatement") return;
      let jaPodeTerRetornado = false;
      for (const declaracao of node.body.body) {
        if (jaPodeTerRetornado) {
          visitarChamadas(declaracao, chamada => {
            const nome = nomeDaChamada(chamada);
            if (nome && EH_HOOK.test(nome)) {
              context.report({ node: chamada, messageId: "depoisDeReturn", data: { nome } });
            }
          });
        }
        if (contemReturn(declaracao)) jaPodeTerRetornado = true;
      }
    }
    return {
      FunctionDeclaration: verificar,
      FunctionExpression: verificar,
      ArrowFunctionExpression: verificar,
    };
  },
};

export default [
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
      rvd: { rules: { "hook-depois-de-return": hookDepoisDeReturn } },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "rvd/hook-depois-de-return": "error",
    },
  },
];
