const DexieLib = window.Dexie

if (!DexieLib) {
  throw new Error('Dexie failed to load from CDN')
}

export const db = new DexieLib('gobooksReader')

db.version(1).stores({
  books: 'id,title,importedAt'
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
