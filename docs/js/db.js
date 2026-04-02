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
  await db.reviews.put(review)
}

export async function getReview(itemId) {
  return db.reviews.get(itemId)
}

export async function getAllReviews() {
  return db.reviews.toArray()
}

export async function deleteReviewsForBook(bookId) {
  await db.reviews.where('bookId').equals(bookId).delete()
}
