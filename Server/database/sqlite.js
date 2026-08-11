// Thin promise adapter over node-sqlite3's callback API.
//
// Every repository used to hand-roll `new Promise((resolve, reject) => ...)` per
// query, which is how three separate bugs got in: a missing `.catch` that hung a
// request forever, a transaction that ignored every error except COMMIT's, and
// mutations that reported success without checking whether a row actually changed.
// `run` returns { lastID, changes } so callers can tell "updated" from "matched
// nothing".

/** Wrap a sqlite3.Database handle in promise-returning helpers. */
function createAdapter(db) {
    const get = (sql, params = []) =>
        new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
        });

    const all = (sql, params = []) =>
        new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
        });

    const run = (sql, params = []) =>
        new Promise((resolve, reject) => {
            // `function` (not an arrow) so `this` carries lastID/changes.
            db.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });

    const exec = (sql) =>
        new Promise((resolve, reject) => {
            db.exec(sql, (err) => (err ? reject(err) : resolve()));
        });

    /**
     * Run `work` inside a transaction, rolling back on any rejection.
     * The previous hand-rolled version checked only COMMIT, so a failed UPDATE
     * inside the transaction still resolved as success.
     */
    const transaction = async (work) => {
        await run('BEGIN IMMEDIATE');
        try {
            const result = await work();
            await run('COMMIT');
            return result;
        } catch (err) {
            // A failed ROLLBACK must not mask the original error.
            await run('ROLLBACK').catch(() => {});
            throw err;
        }
    };

    const close = () =>
        new Promise((resolve, reject) => {
            db.close((err) => (err ? reject(err) : resolve()));
        });

    return { db, get, all, run, exec, transaction, close };
}

module.exports = { createAdapter };
