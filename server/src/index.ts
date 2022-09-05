import { MikroORM } from "@mikro-orm/core";

import mikroOrmConfig from "./mikro-orm.config";

const main = async () => {
    const orm = await MikroORM.init(mikroOrmConfig);
    await orm.migrator.up();
};

main();

console.log("Hello!");
