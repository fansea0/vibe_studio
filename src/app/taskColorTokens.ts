export const taskColorTokens = {
  statusColumnDot: { todo: '#b3b8c5', in_progress: '#6259e8', done: '#14845a' },
  chipType: {
    requirement: { bg: '#efefff', fg: '#4f48c8' },
    bug:        { bg: '#ffe7ea', fg: '#c33e4e' },
  },
  chipPriorityBg: { low: '#e3f8ef', medium: '#f1f2f6', high: '#fff4db', urgent: '#ffe7ea' },
  chipPriorityFg: { low: '#14845a', medium: '#656977', high: '#a45b0c', urgent: '#c33e4e' },
  dueDateWarn:    '#a45b0c',
  dueDateOverdue: '#c33e4e',
} as const