// 책갈피 트리 다루기 — 읽은 책갈피 목록을 트리로 묶고, 쪽을 밀고, 차례 줄로 펼친다.
// 부르는 곳: modes/pages.mjs.
// 먼저 읽을 파일: pdf/nav.mjs(트리를 PDF 에 쓰는 쪽), pdf/inspect.mjs(책갈피 목록을 읽는 쪽).

export const MAX_OUTLINE_DEPTH = 2

/** inspectPdf 의 책갈피 목록 [{ depth, title, page }] 을 트리 [{ title, pageIndex, children }] 로 묶는다. 깊이 상한을 넘는 항목은 버린다. */
export function treeFromFlat(items, maxDepth = MAX_OUTLINE_DEPTH) {
  const roots = []
  const parents = []
  for (const item of items) {
    if (item.depth >= maxDepth || item.page < 0) continue
    const node = { title: item.title, pageIndex: item.page, children: [] }
    const parent = item.depth === 0 ? null : parents[item.depth - 1]
    if (item.depth > 0 && !parent) continue
    ;(parent ? parent.children : roots).push(node)
    parents[item.depth] = node
  }
  return roots
}

/** 트리의 모든 쪽을 offset 만큼 민다. */
export function shiftTree(tree, offset) {
  return tree.map((node) => ({ title: node.title, pageIndex: node.pageIndex + offset, children: shiftTree(node.children, offset) }))
}

/** 트리를 위에서 아래 순서의 줄 [{ depth, title, pageIndex }] 로 편다. 차례 줄과 책갈피가 같은 순서가 된다. */
export function flattenTree(tree, depth = 0) {
  return tree.flatMap((node) => [{ depth, title: node.title, pageIndex: node.pageIndex }, ...flattenTree(node.children, depth + 1)])
}

/** 원고 파일마다 한 항목인 책갈피 트리. starts[i] 는 i 번째 원고가 합본에서 시작하는 쪽이다. */
export function treeFromFaces(titles, starts) {
  return titles.map((title, index) => ({ title, pageIndex: starts[index], children: [] }))
}
