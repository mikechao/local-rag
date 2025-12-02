import { PGlite } from "@electric-sql/pglite"
import { worker } from "@electric-sql/pglite/worker"
import { vector } from "@electric-sql/pglite/vector"
import { lo } from '@electric-sql/pglite/contrib/lo';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { OpfsAhpFS } from '@electric-sql/pglite/opfs-ahp'

worker({
  async init() {
    return new PGlite({
      fs: new OpfsAhpFS("local-rag"),
      extensions: { vector, lo, pg_trgm },
      relaxedDurability: true,
    })
  },
})
