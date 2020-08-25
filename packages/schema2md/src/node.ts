import { DataObject } from "json2md"
import { SchemaNode } from '@microfleet/schema-tools'

import { renderDefinitions, getGenericInfo } from './util'
import type { RendererObj } from './index'

export function renderNode(renderer: RendererObj, node: SchemaNode, level: number): (DataObject|string)[] {
  const result = []
  result.push(...getGenericInfo(renderer, node, level + 1))

  if (node.definitions) {
    result.push({p: '**Definitions**:' })
    result.push(renderDefinitions(renderer, node, level))
  }

  return result
}