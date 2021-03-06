import { omit, pick } from 'lodash'
import { JsonPointer } from 'json-ptr'
import { ResolvedSchema } from '../reference-parser'
import type { SchemaRef } from './ref'

import {
  TREE_NODE_TYPES,
  SCHEMA_DESCRIPTION_KEYS,
  IF_CONDITION_KEYS,
  OBJECT_KEYWORDS,
} from './constants'

const emptyPath = JsonPointer.create('')

type Specs = {
  isProperty?: boolean,
  isAdditionalProperty?: boolean,
  isPatternProperty?: boolean,
  isDefinition?: boolean,
  isRequired?: boolean,
  isCondition?: boolean,
  rootId?: string
}

export type Params = Specs & {
  path: JsonPointer,
  parentPath: JsonPointer,
  depth: number,
  parent: SchemaNode,
}

type Constraints = {
  [key: string]: any
}

type Data = {
  '$id': any
} & {
  [key in typeof SCHEMA_DESCRIPTION_KEYS[number]]: any
}

type Properties = {
  [key: string]: SchemaNode
}

export type Parser = {
  fn: (rs: ResolvedSchema) => boolean
  cl: typeof SchemaNode
}

export class SchemaNode {
  nodes: Map<JsonPointer, SchemaNode> = new Map()
  public params: Specs = {}
  public type: typeof TREE_NODE_TYPES[number] = 'x-node'
  public dataType = ''
  public constraints: Constraints
  public data: Data
  public path: JsonPointer
  public parentPath: JsonPointer
  public depth: number
  public parent?: SchemaNode

  public ifCondition: any; // #TODO
  public definitions?: { [key: string]: SchemaNode }

  static parsers = new Set<Parser>()

  constructor(node: ResolvedSchema, params?: Partial<Params>) {
    const defaults = {
      path: emptyPath,
      parentPath: emptyPath,
      depth: 0,
    }

    const { path, parentPath, parent, depth, ...restParams } = { ...defaults , ...params }
    const { type, ...rest } = node

    this.params = restParams
    this.dataType = type
    this.constraints = omit(rest, ['$id', 'definitions', ...OBJECT_KEYWORDS, ...SCHEMA_DESCRIPTION_KEYS, ...IF_CONDITION_KEYS])
    this.data = pick(rest, ['$id', ...SCHEMA_DESCRIPTION_KEYS])
    this.path = path
    this.parentPath = parentPath
    this.parent = parent
    this.depth = depth

    const conditionals = pick(rest, IF_CONDITION_KEYS)
    if (Object.keys(conditionals).length > 0) {
      this.ifCondition = this.parseNode(conditionals, {
        isCondition: true,
        path: this.path.concat('/if')
      })
    }

    if (rest.definitions) {
      this.definitions = this.parseProperties(rest.definitions, 'definitions', { isDefinition: true })
    }
  }

  protected parseProperties(props: Record<string, ResolvedSchema>, extraPath: string, params: Partial<Params>): Properties | undefined {
    const propsObject: Properties = {}

    if (!props) return

    for (const [key, prop] of Object.entries(props)) {
      const { constraints } = this
      const isRequired = constraints.required ? constraints.required.includes(prop) : false
      const path = this.path.concat(`/${extraPath}`).concat(`/${key}`)
      propsObject[key] = this.parseNode(prop, { ...params, isRequired, path, isCondition: true })
    }

    return propsObject
  }

  protected addNode(node: SchemaNode): void {
    const parentPathLength = [...node.parentPath.path].length
    const pathLength = [...node.path.path].length

    const segments = node.path.path.slice(parentPathLength, parentPathLength + pathLength - parentPathLength)
    const nodePath = JsonPointer.create(segments)

    this.nodes.set(nodePath, node)
    if (this.parent) this.parent.addNode(node)
  }

  protected parseNode(node: ResolvedSchema, params?: Partial<Params>): SchemaNode {
    const parser = [...SchemaNode.parsers.values()].find(({ fn }) => fn(node))
    const c = parser ? parser.cl : SchemaNode

    const newNode = new c(node, {
      ...this.params,
      ...params,
      parent: this,
      parentPath: this.path,
      depth: params?.depth ?? this.depth + 1
    })

    this.addNode(newNode)

    return newNode
  }

  findRefs(): SchemaRef[] {
    return [...this.nodes.values()].filter((node) => node.type === 'x-ref') as SchemaRef[]
  }

  toJSON(): any {
    return {
      params: this.params,
      type: this.type,
      dataType: this.dataType,
      data: this.data,
      constraints: this.constraints,
      definitions: this.definitions,
      path: this.path.toString(),
      parentPath: this.parentPath.toString(),
      depth: this.depth,
    }
  }

  static addParser = (fn: Parser['fn'], cl: Parser['cl']): void => {
    SchemaNode.parsers.add({ fn, cl})
  }

  static parse = (schema: ResolvedSchema): SchemaNode => {
    return (new SchemaNode({}, { depth: -1 })).parseNode(schema, { rootId: schema.$id })
  }
}
