import { Options } from "@mikro-orm/core";

import { PROD } from "./constants";
import { Post } from "./entities/post";

export default {
    migrations: {
        path: "./dist/migrations",
        pathTs: "./src/migrations",
        glob: "*.{js,ts}",
        snapshot: false
    },
    entities: [Post],
    dbName: "lireddit",
    type: "postgresql",
    debug: !PROD,
    allowGlobalContext: true
} as Options;
