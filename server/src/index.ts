import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { MikroORM } from "@mikro-orm/core";
import mikroOrmConfig from "./mikro-orm.config";

import { PORT } from "./constants";

import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";

import { HelloResolver } from "./resolvers/hello";

const main = async () => {
    const orm = await MikroORM.init(mikroOrmConfig);
    await orm.migrator.up();

    const app = express();

    const apolloServer = new ApolloServer({
        schema: await buildSchema({
            resolvers: [HelloResolver],
            validate: false
        })
    });

    await apolloServer.start();
    apolloServer.applyMiddleware({ app, cors: { origin: "*" } });

    app.use(helmet());
    app.use(morgan("dev"));

    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
};

main();
