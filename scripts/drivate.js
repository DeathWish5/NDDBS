use ddbs
sh.enableSharding("ddbs")
sh.addShardTag("dbms1", "DBMS1")
sh.addShardTag("dbms2", "DBMS2")
// user config
db.user.createIndex({"region": 1, "uid": 1})
sh.shardCollection("ddbs.user", {"region": 1, "uid": 1})
sh.disableBalancing("ddbs.user")
sh.addTagRange(
    "ddbs.user",
    {"region": "Beijing", "uid": MinKey},
    {"region": "Beijing", "uid": MaxKey},
    "DBMS1"
)
sh.addTagRange(
    "ddbs.user",
    {"region": "Hong Kong", "uid": MinKey},
    {"region": "Hong Kong", "uid": MaxKey},
    "DBMS2"
)
sh.enableBalancing("ddbs.user")

// article config
db.article.createIndex({"category": 1, "aid": 1})
sh.shardCollection("ddbs.article", {"category": 1, "aid": 1})
sh.disableBalancing("ddbs.article")
sh.addTagRange(
    "ddbs.article",
    {"category": "science", "aid": MinKey},
    {"category": "science", "aid": MaxKey},
    "DBMS1"
)
sh.addTagRange(
    "ddbs.article",
    {"category": "science", "aid": MinKey},
    {"category": "science", "aid": MaxKey},
    "DBMS2"
)
sh.addTagRange(
    "ddbs.article",
    {"category": "technology", "aid": MinKey},
    {"category": "technology", "aid": MaxKey},
    "DBMS2"
)
sh.enableBalancing("ddbs.article")

// grid config
db.fs.chunks.createIndex({"files_id": 1})
sh.shardCollection("ddbs.fs.chunks", {"files_id": "hashed"})
sh.addShardTag("grid", "BIGDATA")
sh.disableBalancing("ddbs.fs.chunks")
sh.addTagRange(
            "ddbs.fs.chunks",
            {"files_id": MinKey},
            {"files_id": MaxKey},
            "BIGDATA"
        )
sh.enableBalancing("ddbs.fs.chunks")

// append read with region
db.user.aggregate([
    { $project: {uid:1, region: 1}},
    { $out: "user_region"}
])
db.read.aggregate([
        { $lookup: {from: "user_region", localField: "uid", foreignField: "uid", as: "tmp"}},
        { $set: { region: "$tmp.region"}},
        { $unwind: "$region"},
        { $unset: "tmp"},
        { $out: "read"}
    ],
    { allowDiskUse: true }
)
db.user_region.drop()

// read config
db.read.createIndex({"region": 1, "id": 1})
sh.shardCollection("ddbs.read", {"region": 1, "id": 1})
sh.disableBalancing("ddbs.read")
sh.addTagRange(
    "ddbs.read",
    {"region": "Beijing", "id": MinKey},
    {"region": "Beijing", "id": MaxKey},
    "DBMS1"
)
sh.addTagRange(
    "ddbs.read",
    {"region": "Hong Kong", "id": MinKey},
    {"region": "Hong Kong", "id": MaxKey},
    "DBMS2"
)
sh.enableBalancing("ddbs.read")

db.article.aggregate([
    { $project: {aid:1, category: 1}},
    { $out: "article_category"}
])
db.read.aggregate([
        { $lookup: {from: "article_category", localField: "aid", foreignField: "aid", as: "tmp"}},
        { $set: { category: "$tmp.category"}},
        { $unwind: "$category"},
        { $unset: "tmp"},
        { $out: "read_tmp"}
    ],
    { allowDiskUse: true }
)
db.article_category.drop()

// get beread
db.read_tmp.aggregate([
        {
            $group: {
                _id: "$aid",
                aid: { $first: "$aid" },
                category: { $first: "$category" },
                timestamp: { $max: "$timestamp" },
                readNum: { $sum: 1 },
                readUidList: { $addToSet: "$uid" },
                commentNum: { $sum: {$toInt: "$commentOrNot" } },
                commentUidList: { $addToSet: { $cond: [ { $eq: ["$commentOrNot","1"] }, "$uid", "$$REMOVE"] } },
                agreeNum: { $sum: {$toInt: "$agreeOrNot" } },
                agreeUidList: { $addToSet: { $cond: [ { $eq: ["$agreeOrNot","1"] }, "$uid", "$$REMOVE"] } },
                shareNum: { $sum: {$toInt: "$shareOrNot" } },
                shareUidList: { $addToSet: { $cond: [ { $eq: ["$shareOrNot","1"] }, "$uid", "$$REMOVE"] } },
            }
        },
        { $out: "beread"}
    ],
    { allowDiskUse: true }
)

db.read_tmp.drop()

// beread config
db.beread.createIndex({"category": 1, "aid": 1})
sh.shardCollection("ddbs.beread", {"category": 1, "aid": 1})
sh.disableBalancing("ddbs.beread")
sh.addTagRange(
    "ddbs.beread",
    {"category": "science", "aid": MinKey},
    {"category": "science", "aid": MaxKey},
    "DBMS1"
)
sh.addTagRange(
    "ddbs.beread",
    {"category": "science", "aid": MinKey},
    {"category": "science", "aid": MaxKey},
    "DBMS2"
)
sh.addTagRange(
    "ddbs.beread",
    {"category": "technology", "aid": MinKey},
    {"category": "technology", "aid": MaxKey},
    "DBMS2"
)
sh.enableBalancing("ddbs.beread")

// get doread
db.read.aggregate([
        {
            $group: {
                _id: "$uid",
                uid: { $first: "$uid" },
                region: { $first: "$region" },
                readNum: { $sum: 1 },
                readAidList: { $addToSet: "$aid" },
                commentNum: { $sum: {$toInt: "$commentOrNot" } },
                commentAidList: { $addToSet: { $cond: [ { $eq: ["$commentOrNot","1"] }, "$aid", "$$REMOVE"] } },
                agreeNum: { $sum: {$toInt: "$agreeOrNot" } },
                agreeAidList: { $addToSet: { $cond: [ { $eq: ["$agreeOrNot","1"] }, "$aid", "$$REMOVE"] } },
                shareNum: { $sum: {$toInt: "$shareOrNot" } },
                shareAidList: { $addToSet: { $cond: [ { $eq: ["$shareOrNot","1"] }, "$aid", "$$REMOVE"] } },
            }
        },
        { $out: "doread"}   
    ],
    { allowDiskUse: true }
)

// doread config
db.doread.createIndex({"region": 1, "uid": 1})
sh.shardCollection("ddbs.doread", {"region": 1, "uid": 1})
sh.disableBalancing("ddbs.doread")
sh.addTagRange(
    "ddbs.doread",
    {"region": "Beijing", "uid": MinKey},
    {"region": "Beijing", "uid": MaxKey},
    "DBMS1"
)
sh.addTagRange(
    "ddbs.doread",
    {"region": "Hong Kong", "uid": MinKey},
    {"region": "Hong Kong", "uid": MaxKey},
    "DBMS2"
)
sh.enableBalancing("ddbs.doread")

// get pop_monthly
db.read.aggregate([
        { 
            $project: { 
                date: {$toDate: {$toLong: "$timestamp"}}, 
                aid: 1, 
                agreeOrNot: 1, 
                commentOrNot: 1, 
                shareOrNot: 1
            } 
        },
        { 
            $set: {
                year: { $year: "$date" }, 
                month: { $month: "$date" },
                popScore: {
                    $sum: [
                        1 , 
                        {$toInt: "$agreeOrNot"}, 
                        {$multiply: [ {$toInt: "$commentOrNot"}, 4 ] },
                        {$multiply: [ {$toInt: "$shareOrNot"}, 4 ] },
                    ]
                }
            }
        },

        {
            $group: {
                _id: { year: "$year", month: "$month", aid: "$aid"},
                totalScore: { $sum: "$popScore" }
            }
        },

        {
            $group: {
                _id: { year: "$_id.year", month: "$_id.month"},
                articles: { $push: { aid: "$_id.aid", score: "$totalScore" } }
            }
        },

        // output
        {"$out": "pop_monthly"}
    ],
    { allowDiskUse: true }
)

db.pop_monthly.updateMany(
    {},
    {
        $push: {
            articles: {
                $each: [],
                $sort: { score: -1 },
            }
        }
    }
)

db.read.aggregate([
    { 
        $project: { 
            date: {$toDate: {$toLong: "$timestamp"}}, 
            aid: 1, 
            agreeOrNot: 1, 
            commentOrNot: 1, 
            shareOrNot: 1
        } 
    },
    // add year and month fields
    { 
        $set: {
            year: { $year: "$date" }, 
            week: { $week: "$date" },
            popScore: {
                $sum: [
                    1, 
                    {$toInt: "$agreeOrNot"}, 
                    {$multiply: [ {$toInt: "$commentOrNot"}, 4 ] },
                    {$multiply: [ {$toInt: "$shareOrNot"}, 4 ] },
                ]
            }
        }
    },

    {
        $group: {
            _id: { year: "$year", week: "$week", aid: "$aid"},
            totalScore: { $sum: "$popScore" }
        }
    },

    {
        $group: {
            _id: { year: "$_id.year", week: "$_id.week"},
            articles: { $push: { aid: "$_id.aid", score: "$totalScore" } }
        }
    },

    // output
    {"$out": "pop_weekly"}
],
{ allowDiskUse: true }
)

db.pop_weekly.updateMany(
    {},
    {
        $push: {
            articles: {
                $each: [],
                $sort: { score: -1 },
            }
        }
    }
)

db.read.aggregate([
    { 
        $project: { 
            date: {$toDate: {$toLong: "$timestamp"}}, 
            aid: 1, 
            agreeOrNot: 1, 
            commentOrNot: 1, 
            shareOrNot: 1
        } 
    },
    // add year and month fields
    { 
        $set: {
            year: { $year: "$date" }, 
            day: { $dayOfYear: "$date" },
            popScore: {
                $sum: [
                    1, 
                    {$toInt: "$agreeOrNot"}, 
                    {$multiply: [ {$toInt: "$commentOrNot"}, 4 ] },
                    {$multiply: [ {$toInt: "$shareOrNot"}, 4 ] },
                ]
            }
        }
    },

    {
        $group: {
            _id: { year: "$year", day: "$day", aid: "$aid"},
            totalScore: { $sum: "$popScore" }
        }
    },

    {
        $group: {
            _id: { year: "$_id.year", day: "$_id.day"},
            articles: { $push: { aid: "$_id.aid", score: "$totalScore" } }
        }
    },

    // output
    {"$out": "pop_daily"}
],
{ allowDiskUse: true }
)

db.pop_daily.updateMany(
    {},
    {
        $push: {
            articles: {
                $each: [],
                $sort: { score: -1 },
            }
        }
    }
)