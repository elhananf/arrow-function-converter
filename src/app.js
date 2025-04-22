import fsPromises from 'fs/promises';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import { program } from 'commander';

const parser = new Parser();
parser.setLanguage(JavaScript);

function getSource(code, node) {
  return code.slice(node.startIndex, node.endIndex);
}

function transformArrowFunctions(sourceCode) {
  const tree = parser.parse(sourceCode);
  const root = tree.rootNode;
  const edits = [];

  function walk(node) {
    if (node.type === 'lexical_declaration') {
      for (const decl of node.namedChildren) {
        if (decl.type === 'variable_declarator') {
          const nameNode = decl.childForFieldName('name');
          const valueNode = decl.childForFieldName('value');

          if (valueNode && valueNode.type === 'arrow_function') {
            const name = getSource(sourceCode, nameNode);
            const params = getSource(sourceCode, valueNode.childForFieldName('parameters'));
            const bodyNode = valueNode.childForFieldName('body');

            let body = getSource(sourceCode, bodyNode);
            if (bodyNode.type !== 'statement_block') {
              body = `{ return ${body}; }`;
            }

            const replacement = `function ${name}${params} ${body}`;
            edits.push({ start: node.startIndex, end: node.endIndex, replacement });
          }
        }
      }
    }

    for (const child of node.namedChildren) {
      walk(child);
    }
  }

  walk(root);

  // Apply edits from bottom to top to preserve offsets
  let transformed = sourceCode;
  for (const { start, end, replacement } of edits.sort((a, b) => b.start - a.start)) {
    transformed = transformed.slice(0, start) + replacement + transformed.slice(end);
  }

  return transformed;
}

// Entry point
program
  .argument('<inputFile>')
  .argument('<outputFile>')
  .showHelpAfterError()
  .action(async function main(inputFile, outputFile) {
    const inputCode = await fsPromises.readFile(inputFile, { encoding: 'utf8' });
    const outputCode = transformArrowFunctions(inputCode);
    await fsPromises.writeFile(outputFile, outputCode);
  })
  .parse();
