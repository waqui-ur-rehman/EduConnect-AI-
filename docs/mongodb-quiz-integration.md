# Quiz persistence

The teacher quiz page previously stored create, edit, publish and delete actions
only in `localStorage`, even when the course itself was stored in MongoDB.
The teacher page now uses `/api/quizzes/courses/:courseId/teacher` and displays
publication status returned by the server. Its roster, attempts and scores also
come from MongoDB. Students with MongoDB courses use the authenticated quiz API
for loading quizzes, starting attempts and submitting answers for server scoring.

When the teacher opens Course Quizzes in the original browser, saved browser
quizzes are transferred to the teacher's matching MongoDB courses. Both current
course IDs and imported courses' `legacyId` values are checked. Original browser
questions remain as a backup with an added `mongoQuizId` marker. A unique index
on teacher, course and legacy quiz ID prevents duplicate transfers. The marker
prevents a deleted server quiz from being restored from its browser backup.

Browser quizzes marked published are saved first and then published through the
normal server checks. If a course has no approved published version, its quizzes
remain MongoDB drafts and the page explains why publication failed. Failed saves
are reported; they do not create a local-only successful save.

To verify existing browser records, run the backend and frontend, open the
teacher's Course Quizzes page in the browser where they were created, and refresh
MongoDB Compass at the database configured by `MONGO_URI`, collection
`coursequizzes`. Reloading the page must retain the same document IDs and counts.
Original browser submissions are retained locally as backups; they are not
imported as trusted, server-scored attempts.

Validation: `npm.cmd run build`, scoped ESLint, and `npm.cmd test` in `backend`.
`backend/tests/quizWorkflow.test.mjs` exercises the actual frontend API and
migration helper over authenticated HTTP against a uniquely named disposable
MongoDB database, including publication failures and student submissions.
