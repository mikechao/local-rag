import { PGlite } from "@electric-sql/pglite"
import { worker } from "@electric-sql/pglite/worker"
import { vector } from "@electric-sql/pglite/vector"
import { IdbFs } from "@electric-sql/pglite"

worker({
  async init() {
    return new PGlite({
      fs: new IdbFs("local-rag"),
      extensions: { vector },
      relaxedDurability: true,
    })
  },
})
