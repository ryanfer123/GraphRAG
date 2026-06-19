export const dummyDocuments = [
  { id: 'doc1', name: 'Annual_Report_2025.pdf', pages: 42, status: 'indexed' },
  { id: 'doc2', name: 'Product_Spec_v3.docx', pages: 18, status: 'indexed' },
  { id: 'doc3', name: 'Market_Research.pdf', pages: 67, status: 'processing' },
]

export const dummyConversation = [
  {
    id: 'm1',
    role: 'user',
    content: 'Summarize chapter 3',
  },
  {
    id: 'm2',
    role: 'assistant',
    content:
      'Chapter 3 focuses on the company\'s operational restructuring, covering three main initiatives: regional consolidation of warehouses, a shift to a hybrid logistics model, and a 12% reduction in fixed overhead. The chapter argues these changes directly enabled the margin improvement discussed later in Chapter 4.',
    citations: [
      { id: 'c1', page: 18, type: 'paragraph', content: 'Revenue increased by 15% following the consolidation of regional warehouses.' },
      { id: 'c2', page: 21, type: 'table', content: 'Table 2 — Operating cost breakdown by region (FY2024 vs FY2025).' },
      { id: 'c3', page: 23, type: 'figure', content: 'Figure 4 — Hybrid logistics network diagram.' },
    ],
    highlightedNodes: ['2', '5', '7'],
  },
  {
    id: 'm3',
    role: 'user',
    content: 'What drove the 15% revenue increase specifically?',
  },
  {
    id: 'm4',
    role: 'assistant',
    content:
      'The 15% revenue increase is attributed primarily to warehouse consolidation, which reduced fulfillment time and lowered per-unit shipping cost. Table 2 shows the regional cost breakdown that supports this, and Figure 4 illustrates the resulting hybrid logistics network.',
    citations: [
      { id: 'c4', page: 18, type: 'paragraph', content: 'Revenue increased by 15% following the consolidation of regional warehouses.' },
      { id: 'c5', page: 21, type: 'table', content: 'Table 2 — Operating cost breakdown by region (FY2024 vs FY2025).' },
    ],
    highlightedNodes: ['2', '7'],
  },
]

export function fakeAskQuestion(question) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        answer:
          `Based on the indexed documents, here's what I found regarding "${question}": the relevant section discusses revenue growth driven by operational efficiency gains, supported by structured tables and cross-referenced figures.`,
        citations: [
          { id: 'cx1', page: 18, type: 'paragraph', content: 'Revenue increased by 15%.' },
          { id: 'cx2', page: 26, type: 'table', content: 'Table 3 — Quarterly revenue by segment.' },
        ],
        highlightedNodes: ['2', '5', '7'],
      })
    }, 1100)
  })
}
