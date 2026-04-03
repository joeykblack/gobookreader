const DexieLib = window.Dexie

if (!DexieLib) {
  throw new Error('Dexie failed to load from CDN')
}

export const db = new DexieLib('gobooksReader')

db.version(1).stores({
  books: 'id,title,importedAt'
})

db.version(2).stores({
  books: 'id,title,importedAt',
  reviews: 'itemId,bookId,dueDate,lastReviewedAt'
})

db.version(3).stores({
  books: 'id,title,importedAt',
  reviews: 'itemId,bookId,dueDate,lastReviewedAt,createdAt'
})

db.version(4).stores({
  books: 'id,title,importedAt',
  section: 'itemId,bookId,chapterFile,sectionName,dueDate,lastReviewedAt,createdAt,lastRating,scheduler',
  review: '++id,itemId,bookId,chapterFile,sectionName,reviewedAt,rating,scheduler,dueDateBefore,dueDateAfter'
}).upgrade(async tx => {
  const oldReviews = tx.table('reviews')
  const section = tx.table('section')

  const rows = await oldReviews.toArray()
  if (rows.length) {
    await section.bulkPut(rows.map(r => ({
      ...r,
      scheduler: r.scheduler || 'fsrs'
    })))
  }
})

export async function upsertBook(book) {
  await db.books.put(book)
}

export async function getAllBooks() {
  return db.books.orderBy('importedAt').reverse().toArray()
}

export async function getBook(bookId) {
  return db.books.get(bookId)
}

export async function deleteBook(bookId) {
  await db.books.delete(bookId)
}

export async function upsertReview(review) {
  await db.section.put(review)
}

export async function getReview(itemId) {
  return db.section.get(itemId)
}

export async function getAllReviews() {
  return db.section.toArray()
}

export async function getReviewsForChapter(bookId, chapterFile) {
  return db.section
    .where('bookId')
    .equals(bookId)
    .filter(review => review.chapterFile === chapterFile)
    .toArray()
}

export async function deleteReviewsForBook(bookId) {
  await db.transaction('rw', db.section, db.review, async () => {
    await db.section.where('bookId').equals(bookId).delete()
    await db.review.where('bookId').equals(bookId).delete()
  })
}

export async function deleteReview(itemId) {
  await db.transaction('rw', db.section, db.review, async () => {
    await db.section.delete(itemId)
    await db.review.where('itemId').equals(itemId).delete()
  })
}

export async function deleteAllReviews() {
  await db.transaction('rw', db.section, db.review, async () => {
    await db.section.clear()
    await db.review.clear()
  })
}

export async function addReviewEvent(event) {
  await db.review.add(event)
}

export async function getAllReviewEvents() {
  return db.review.toArray()
}

export async function getReviewEventsForItem(itemId) {
  return db.review.where('itemId').equals(itemId).toArray()
}
