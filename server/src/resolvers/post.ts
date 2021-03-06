/* eslint-disable quotes */
import { isAuth } from "../middleware/isAuth";
import { MyContext } from "../types/types";
import {
    Arg,
    Ctx,
    Field,
    FieldResolver,
    InputType,
    Int,
    Mutation,
    ObjectType,
    Query,
    Resolver,
    Root,
    UseMiddleware
} from "type-graphql";

import { Post } from "../entities/Post";
import { getConnection } from "typeorm";
import { Updoot } from "../entities/Updoot";
import { User } from "../entities/User";

@InputType()
class PostInput {
    @Field()
    title: string;

    @Field()
    text: string;
}

@ObjectType()
class PostFieldError {
    @Field()
    field: string;

    @Field()
    message: string;
}

@ObjectType()
class PostResponse {
    @Field(() => [PostFieldError], { nullable: true })
    errors?: PostFieldError[];

    @Field(() => Post, { nullable: true })
    post?: Post | Promise<Post>;
}

@ObjectType()
class PaginatedPosts {
    @Field(() => [Post])
    posts: Post[];

    @Field()
    hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
    @FieldResolver(() => String)
    textSnippet(@Root() root: Post) {
        if (root.text.length <= 50) return root.text;
        // Slice the text to 50 characters
        root.text = root.text.substring(0, 50);
        // Slice the text at the last occurrence of a space
        // This prevents slicing words in half
        // Then add a "..." at the end
        return root.text.substring(0, root.text.lastIndexOf(" ")) + "...";
    }

    @FieldResolver(() => User)
    creator(@Root() post: Post, @Ctx() { userLoader }: MyContext) {
        return userLoader.load(post.creatorId);
    }

    @FieldResolver(() => Int, { nullable: true })
    async voteStatus(
        @Root() post: Post,
        @Ctx() { updootLoader, req }: MyContext
    ) {
        if (!req.session.userId) return null;

        const updoot = await updootLoader.load({
            postId: post.id,
            userId: req.session.userId
        });

        return updoot ? updoot.value : null;
    }

    @Mutation(() => Boolean)
    @UseMiddleware(isAuth)
    async vote(
        @Arg("postId", () => Int) postId: number,
        @Arg("value", () => Int) value: number,
        @Ctx() { req }: MyContext
    ) {
        const isUpdoot = value !== -1;
        const realValue = isUpdoot ? 1 : -1;
        const { userId } = req.session;

        const updoot = await Updoot.findOne({ where: { postId, userId } });

        // User has voted on the post before
        // and they are changing their vote
        if (updoot && updoot.value !== realValue) {
            await getConnection().transaction(async (tm) => {
                await tm.query(
                    `
                    update updoot
                    set value = $1
                    where "postId" = $2 and "userId" = $3
                `,
                    [realValue, postId, userId]
                );

                await tm.query(
                    `
                    update post
                    set points = points + $1
                    where id = $2
                `,
                    [2 * realValue, postId]
                );
            });
        } else if (!updoot) {
            // User has never voted before
            await getConnection().transaction(async (tm) => {
                await tm.query(
                    `
                    insert into updoot ("userId", "postId", value)
                    values ($1, $2, $3)
                `,
                    [userId, postId, realValue]
                );

                await tm.query(
                    `
                    update post
                    set points = points + $1
                    where id = $2
                `,
                    [realValue, postId]
                );
            });
        }
        return true;
    }

    @Query(() => PaginatedPosts)
    async posts(
        @Arg("limit", () => Int) limit: number,
        @Arg("cursor", () => String, { nullable: true }) cursor: string | null
    ): Promise<PaginatedPosts> {
        const realLimit = Math.min(50, limit);
        const replacements: unknown[] = [realLimit + 1];

        if (cursor) {
            replacements.push(new Date(parseInt(cursor)));
        }

        const posts = await getConnection().query(
            ` 
            select p.*
            from post p
            ${cursor ? `where p."createdAt" < $2` : ""}
            order by p."createdAt" DESC
            limit $1
        `,
            replacements
        );

        return {
            posts: posts.slice(0, realLimit),
            hasMore: posts.length === realLimit + 1
        };
    }

    @Query(() => Post, { nullable: true })
    post(@Arg("id", () => Int) id: number): Promise<Post | undefined> {
        return Post.findOne(id);
    }

    @Mutation(() => PostResponse)
    @UseMiddleware(isAuth)
    async createPost(
        @Arg("options") options: PostInput,
        @Ctx() { req }: MyContext
    ): Promise<PostResponse> {
        if (!options.title) {
            return {
                errors: [{ field: "title", message: "Title is required" }]
            };
        }

        if (!options.text) {
            return {
                errors: [{ field: "text", message: "Body is required" }]
            };
        }

        return {
            post: Post.create({
                ...options,
                creatorId: req.session.userId
            }).save()
        };
    }

    @Mutation(() => Post, { nullable: true })
    @UseMiddleware(isAuth)
    async updatePost(
        @Arg("id", () => Int) id: number,
        @Arg("title") title: string,
        @Arg("text") text: string,
        @Ctx() { req }: MyContext
    ): Promise<Post | null> {
        const result = await getConnection()
            .createQueryBuilder()
            .update(Post)
            .set({ title, text })
            .where('id = :id and "creatorId" = :creatorId', {
                id,
                creatorId: req.session.userId
            })
            .returning("*")
            .execute();

        return result.raw[0];
    }

    @Mutation(() => Boolean)
    @UseMiddleware(isAuth)
    async deletePost(
        @Arg("id", () => Int) id: number,
        @Ctx() { req }: MyContext
    ): Promise<boolean> {
        await Post.delete({ id, creatorId: req.session.userId });
        return true;
    }
}
