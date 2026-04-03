const DEFAULT_FSRS_SETTINGS = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
}

let fsrsLibPromise = null

async function loadFsrsLib() {
  if (!fsrsLibPromise) {
    fsrsLibPromise = import('https://esm.sh/ts-fsrs@5?bundle')
  }
  return fsrsLibPromise
}

function normalizeFsrsSettings(settings = {}) {
  const merged = { ...DEFAULT_FSRS_SETTINGS, ...(settings || {}) }
  return {
    request_retention: Math.min(0.99, Math.max(0.5, Number(merged.request_retention || DEFAULT_FSRS_SETTINGS.request_retention))),
    maximum_interval: Math.max(1, Math.round(Number(merged.maximum_interval || DEFAULT_FSRS_SETTINGS.maximum_interval))),
    enable_fuzz: !!merged.enable_fuzz,
    enable_short_term: merged.enable_short_term !== false,
    learning_steps: Array.isArray(merged.learning_steps) && merged.learning_steps.length
      ? merged.learning_steps
      : DEFAULT_FSRS_SETTINGS.learning_steps,
    relearning_steps: Array.isArray(merged.relearning_steps) && merged.relearning_steps.length
      ? merged.relearning_steps
      : DEFAULT_FSRS_SETTINGS.relearning_steps,
  }
}

function toFsrsCard(card) {
  const safe = card || {}
  return {
    ...safe,
    due: safe.due ? new Date(safe.due) : new Date(),
    last_review: safe.last_review ? new Date(safe.last_review) : undefined,
  }
}

function fromFsrsCard(card) {
  return {
    ...card,
    due: card?.due ? new Date(card.due).toISOString() : new Date().toISOString(),
    last_review: card?.last_review ? new Date(card.last_review).toISOString() : null,
  }
}

function toFsrsRating(rating, Rating) {
  const normalized = String(rating || '').toLowerCase()
  if (normalized === 'again') return Rating.Again
  if (normalized === 'hard') return Rating.Hard
  if (normalized === 'good') return Rating.Good
  if (normalized === 'easy') return Rating.Easy
  throw new Error(`Unknown FSRS rating: ${rating}`)
}

export function getDefaultFsrsSettings() {
  return {
    ...DEFAULT_FSRS_SETTINGS,
    learning_steps: [...DEFAULT_FSRS_SETTINGS.learning_steps],
    relearning_steps: [...DEFAULT_FSRS_SETTINGS.relearning_steps],
  }
}

export async function applyFsrsRating(review, rating, now = new Date(), settings = {}) {
  const { fsrs, Rating, createEmptyCard } = await loadFsrsLib()
  const config = normalizeFsrsSettings(settings)
  const scheduler = fsrs(config)

  const card = review.fsrsCard ? toFsrsCard(review.fsrsCard) : createEmptyCard()
  const result = scheduler.next(card, new Date(now), toFsrsRating(rating, Rating))
  const nextCard = fromFsrsCard(result.card)

  return {
    ...review,
    fsrsCard: nextCard,
    dueDate: nextCard.due,
    intervalDays: Number(result.card?.scheduled_days || review.intervalDays || 0),
    repetitions: Number(result.card?.reps || review.repetitions || 0),
    lapses: Number(result.card?.lapses || review.lapses || 0),
    easeFactor: Number(review.easeFactor ?? 2.5),
    lastReviewedAt: new Date(now).toISOString(),
    lastRating: String(rating)
  }
}
