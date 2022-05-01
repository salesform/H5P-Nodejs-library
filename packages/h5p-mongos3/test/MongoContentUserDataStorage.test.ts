import { IFinishedUserData } from '@lumieducation/h5p-server';
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';

import MongoContentUserDataStorage from '../src/MongoContentUserDataStorage';
import User from './User';

describe('MongoContentUserDataStorage', () => {
    let mongo: Db;
    let mongoClient: MongoClient;
    let userDataCollection: Collection<any>;
    let finishedCollection: Collection<any>;
    let userDataCollectionName: string;
    let finishedCollectionName: string;
    let testId: string;
    let counter = 0;
    let storage: MongoContentUserDataStorage;

    beforeAll(async () => {
        testId = new ObjectId().toHexString();
        mongoClient = await MongoClient.connect('mongodb://localhost:27017', {
            auth: {
                username: 'root',
                password: 'h5pnodejs'
            },
            ignoreUndefined: true
        });
        mongo = mongoClient.db('h5pintegrationtest');
    });

    beforeEach(async () => {
        counter += 1;
        userDataCollectionName = `${testId}collectionuserdata${counter}`;
        finishedCollectionName = `${testId}collectionfinished${counter}`;
        try {
            await mongo.dropCollection(userDataCollectionName);
        } catch {
            // We do nothing, as we just want to make sure the collection doesn't
            // exist.
        }
        try {
            await mongo.dropCollection(finishedCollectionName);
        } catch {
            // We do nothing, as we just want to make sure the collection doesn't
            // exist.
        }
        userDataCollection = mongo.collection(userDataCollectionName);
        finishedCollection = mongo.collection(finishedCollectionName);
        storage = new MongoContentUserDataStorage(
            userDataCollection,
            finishedCollection
        );
        await storage.createIndexes();
    });

    afterEach(async () => {
        try {
            await mongo.dropCollection(userDataCollectionName);
        } catch {
            // If a test didn't create a collection, it can't be deleted.
        }
        try {
            await mongo.dropCollection(finishedCollectionName);
        } catch {
            // If a test didn't create a collection, it can't be deleted.
        }
    });

    afterAll(async () => {
        await mongoClient.close();
    });

    it('can call index creation a second time', async () => {
        await expect(storage.createIndexes()).resolves.not.toThrow();
    });

    describe('user data', () => {
        const user = new User();
        const dataTemplate = {
            dataType: 'dataType',
            invalidate: true,
            preload: true,
            subContentId: '0',
            userState: 'state',
            contentId: '1',
            userId: user.id
        };

        it('adds user data and lets you retrieve it again', async () => {
            await expect(
                storage.createOrUpdateContentUserData(dataTemplate)
            ).resolves.not.toThrow();
            await expect(
                storage.getContentUserData('1', 'dataType', '0', user)
            ).resolves.toMatchObject(dataTemplate);
            const res = await storage.getContentUserDataByContentIdAndUser(
                '1',
                user
            );
            expect(res.length).toEqual(1);
        });

        it("returns null if user data doesn't exist", async () => {
            await expect(
                storage.getContentUserData('1', 'dataType', '0', user)
            ).resolves.toEqual(null);
        });

        it("returns empty if user data doesn't exist", async () => {
            const res = await storage.getContentUserDataByContentIdAndUser(
                '1',
                user
            );
            expect(res.length).toEqual(0);
        });

        it('updates user data', async () => {
            await storage.createOrUpdateContentUserData(dataTemplate);

            const data2 = { ...dataTemplate, userState: 'state2' };

            await storage.createOrUpdateContentUserData(data2);

            await expect(
                storage.getContentUserData('1', 'dataType', '0', user)
            ).resolves.toMatchObject(data2);

            expect(await userDataCollection.countDocuments()).toEqual(1);
        });

        it('returns all data for a user', async () => {
            const returned1 = await storage.getContentUserDataByUser(user);
            expect(returned1.length).toEqual(0);

            const data1 = { ...dataTemplate, dataType: 'dataType1' };
            const data2 = {
                ...dataTemplate,
                dataType: 'dataType2',
                contentId: '2'
            };
            await storage.createOrUpdateContentUserData(data1);
            await storage.createOrUpdateContentUserData(data2);

            const returned2 = await storage.getContentUserDataByUser(user);
            expect(returned2.length).toEqual(2);
        });

        it('deletes invalidated user data', async () => {
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                userId: '1',
                invalidate: true
            });
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                userId: '2',
                invalidate: true
            });
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                userId: '3',
                invalidate: false
            });

            await storage.deleteInvalidatedContentUserData(
                dataTemplate.contentId
            );
            const notFound1 =
                await storage.getContentUserDataByContentIdAndUser(
                    dataTemplate.contentId,
                    user
                );
            expect(notFound1.length).toEqual(0);

            const notFound2 =
                await storage.getContentUserDataByContentIdAndUser(
                    dataTemplate.contentId,
                    { ...user, id: '2' }
                );
            expect(notFound2.length).toEqual(0);

            const found = await storage.getContentUserDataByContentIdAndUser(
                dataTemplate.contentId,
                { ...user, id: '3' }
            );
            expect(found.length).toEqual(1);
        });

        it('deletes user data by user', async () => {
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                contentId: '1'
            });
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                contentId: '2'
            });
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                userId: '2',
                contentId: '1'
            });

            await storage.deleteAllContentUserDataByUser(user);
            const notFound1 =
                await storage.getContentUserDataByContentIdAndUser('1', user);
            expect(notFound1.length).toEqual(0);

            const notFound2 =
                await storage.getContentUserDataByContentIdAndUser('2', user);
            expect(notFound2.length).toEqual(0);

            const found = await storage.getContentUserDataByContentIdAndUser(
                '1',
                {
                    ...user,
                    id: '2'
                }
            );
            expect(found.length).toEqual(1);
        });

        it('deletes user data by contentId', async () => {
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                contentId: '1'
            });
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                contentId: '1',
                userId: '2'
            });
            await storage.createOrUpdateContentUserData({
                ...dataTemplate,
                contentId: '2'
            });

            await storage.deleteAllContentUserDataByContentId('1');
            const user2Data = await storage.getContentUserDataByUser({
                ...user,
                id: '2'
            });
            expect(user2Data.length).toEqual(0);
            const user1Data = await storage.getContentUserDataByUser(user);
            expect(user1Data.length).toEqual(1);
        });
    });
    describe('finished data', () => {
        const user = new User();
        const dataTemplate: IFinishedUserData = {
            completionTime: 1000,
            contentId: '1',
            finishedTimestamp: 10000,
            maxScore: 10,
            score: 5,
            openedTimestamp: 5000,
            userId: user.id
        };

        it('stores finished data and lets you retrieve it again', async () => {
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,
                score: 10
            });
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,

                userId: '2'
            });
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,
                userId: '3'
            });

            const ret1 = await storage.getFinishedDataByContentId('1');
            expect(ret1.length).toEqual(3);

            const ret2 = await storage.getFinishedDataByUser(user);
            expect(ret2.length).toEqual(1);
            expect(ret2[0]).toMatchObject({
                ...dataTemplate,
                score: 10
            });
        });

        it('replaces finished data', async () => {
            await storage.createOrUpdateFinishedData(dataTemplate);
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,
                score: 10
            });

            const ret = await storage.getFinishedDataByContentId('1');
            expect(ret.length).toEqual(1);
            expect(ret[0].score).toEqual(10);
        });

        it('deletes finished data by content id', async () => {
            await storage.createOrUpdateFinishedData({
                ...dataTemplate
            });
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,

                userId: '2'
            });
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,
                contentId: '2'
            });

            await storage.deleteFinishedDataByContentId('1');

            const ret = await storage.getFinishedDataByUser(user);
            expect(ret.length).toEqual(1);
            expect(ret[0]).toMatchObject({
                ...dataTemplate,
                contentId: '2'
            });
        });

        it('deletes finished data by user', async () => {
            await storage.createOrUpdateFinishedData({
                ...dataTemplate
            });
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,
                contentId: '2'
            });
            await storage.createOrUpdateFinishedData({
                ...dataTemplate,
                userId: '2'
            });

            await storage.deleteFinishedDataByUser(user);

            const ret1 = await storage.getFinishedDataByUser({
                ...user
            });
            expect(ret1.length).toEqual(0);

            const ret2 = await storage.getFinishedDataByUser({
                ...user,
                id: '2'
            });
            expect(ret2.length).toEqual(1);
        });
    });
});
