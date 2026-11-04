import assert from 'node:assert/strict'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

/** Execute selected production declarations without depending on a neighbouring
 * function or accidentally including the component template after a move. */
export function vueScriptDeclarations(source: string, names: string[]): string {
  const { descriptor, errors } = parse(source)
  assert.equal(errors.length, 0, 'Vue fixture source must parse')
  assert.ok(descriptor.scriptSetup, 'Vue fixture needs script setup')
  const ast = ts.createSourceFile('fixture.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const found = new Set<string>()
  const statements = ast.statements.filter(statement => {
    const declared = ts.isFunctionDeclaration(statement) && statement.name ? [statement.name.text]
      : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(declaration => declaration.name.getText(ast)) : []
    const selected = declared.filter(name => names.includes(name))
    for (const name of selected) {
      assert.ok(!found.has(name), `Duplicate fixture declaration: ${name}`)
      found.add(name)
    }
    return selected.length > 0
  })
  assert.deepEqual([...found].sort(), [...names].sort(), 'Production fixture declarations changed; update explicit dependencies')
  return statements.map(statement => statement.getText(ast)).join('\n')
}
