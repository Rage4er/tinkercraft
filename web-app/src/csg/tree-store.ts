// ============================================================
// TreeStore — инкапсулированное хранилище узлов дерева сборки
// ============================================================
//
// Заменяет глобальный `treeNodes: Map<string, TreeNode>`.
// Предоставляет контролируемый API для доступа к узлам дерева.
// Singleton `treeStore` экспортируется для обратной совместимости.

import type { TreeNode } from './types'

export class TreeStore {
    private _nodes = new Map<string, TreeNode>()

    /** Получить узел по ID */
    getNode(id: string): TreeNode | undefined {
        return this._nodes.get(id)
    }

    /** Установить узел */
    setNode(id: string, node: TreeNode): void {
        this._nodes.set(id, node)
    }

    /**
     * Удалить узел.
     * @param recursive — если true, рекурсивно удаляет всех детей
     */
    deleteNode(id: string, recursive = false): void {
        const node = this._nodes.get(id)
        if (node) {
            if (recursive && node.children) {
                // Recursively delete all children first
                for (const childId of node.children) {
                    this.deleteNode(childId, true)
                }
            } else if (node.children) {
                // Non-recursive: reset parentId on children so they lose the parent link
                for (const childId of node.children) {
                    const child = this._nodes.get(childId)
                    if (child) child.parentId = undefined
                }
            }
            // Reset own parentId
            if (node.parentId) node.parentId = undefined
        }
        this._nodes.delete(id)
    }

    /** Очистить всё дерево */
    clear(): void {
        this._nodes.clear()
    }

    /** Получить все узлы как массив */
    getAllNodes(): TreeNode[] {
        return [...this._nodes.values()]
    }

    /** Получить все узлы как ReadonlyMap (без копирования) */
    getAllNodesMap(): ReadonlyMap<string, TreeNode> {
        return this._nodes
    }

    /** Количество узлов в дереве */
    get nodeCount(): number {
        return this._nodes.size
    }

    /** Проверить существование узла */
    hasNode(id: string): boolean {
        return this._nodes.has(id)
    }
}

/** Singleton для обратной совместимости */
export const treeStore = new TreeStore()
