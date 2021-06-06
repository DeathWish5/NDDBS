# 2021spring THU DDBS 课程项目报告

张译仁 2020310791

// todo 项目地址

说明：manual 在本文档最后一节。

## 完成概况

后端基本完成，主要包括：

* 批量载入初始数据
* 依据要求进行 fragment 和 sharding
* 自动生成 beread, pop_monthly, pop_weekly, pop_daily 四张衍生表
* 多媒体数据的存储与读取
* 监听 read 表改动，完成相应的衍生表修改

由于人力原因，前端工作未完成，依赖于直接连接 mongos 并操作。

## 实现细节

以整个项目的执行流程来描述实现细节，具体流程见 Makefile 文件。

### docker 配置

见 docker 目录下的 `docker-compose.yaml` 文件（省去了为了 sharding 而重复相同配置的 server，除了 `mongos` 外全部为 3 个节点集群）:

```yaml
services:

  # mongo sharding 要求的配置服务器集群，其余节点的 container_name / image / volumes 省略
  cfg1:
    container_name: cfg1
    image: mongo
    command: mongod --configsvr --replSet cfg --port 27017 --dbpath /data/db
    ports:
      - 40001:27017
    volumes:
      - ./volumes/cfg1:/data/db
　
  # 模拟北京的 dbms 节点，shard server 集群
  dmbs1_svr1:
    command: mongod --shardsvr --replSet dbms1 --port 27017 --dbpath /data/db
    ports:
      - 40004:27017
  
  # 模拟上海的 dbms 节点，shard server 集群
  dmbs2_svr1:
    command: mongod --shardsvr --replSet dbms2 --port 27017 --dbpath /data/db
    ports:
      - 40007:27017

  # 储存多媒体数据的 gridfs 服务器
  grid_svr1:
    command: mongod --shardsvr --replSet grid --port 27017 --dbpath /data/db
    ports:
      - 40010:27017

  # 路由节点，也是该项目的前端
  mongos:
    command: mongos --configdb cfg/${HOSTIP}:40001,${HOSTIP}:40002,${HOSTIP}:40003 --bind_ip 0.0.0.0 --port 27017
    ports:
      - 40000:27017
```

在跟目录下执行 `make dockerup` 可以启动 docker，具体指令如下：

```makefile
dockerup:
	mkdir -p $(MONGOS_VOLUME_DIR)
	cp data-files/* $(MONGOS_VOLUME_DIR)
	cp scripts/* $(MONGOS_VOLUME_DIR)
	env HOSTIP=${HOSTIP} docker-compose -f docker/docker-compose.yaml up -d
```

除了执行 docker-compose 指令外，还预先拷贝了初始化数据文件和脚本到 `mongos` server。

完成后可以使用 `docker ps` 指令或者 `docker exec -it bash` 来查看 docker 状态。

### 初始化 mongo 集群

在启动 docker 之后，还需要执行一些指令来初始化一些配置，具体命令如下:

```javascript
// 首先使用 rs.initiate() 初始化 sharding 集群，cfg / dbms1 / bsms2 / grid 四个集群类似
// 注意端口映射与 docker-compose 文件一致。以 cfg 集群为例，执行:
rs.initiate({
    _id: "cfg", 
    configsvr: true, 
    members: [
        { _id : 0, host : "${HOSTIP}:40001"}, 
        { _id : 1, host : "${HOSTIP}:40002"}, 
        { _id : 2, host : "${HOSTIP}:40003"},
    ]
})

// 然后需要在 mongos 节点增加 shard 信息，使用 sh.addShard()
// 以 dbms1 集群的初始化为例：
sh.addShard("dbms1/${HOSTIP}:40004")
sh.addShard("dbms1/${HOSTIP}:40005")
sh.addShard("dbms1/${HOSTIP}:40006")
```

参考：[mongo官方](https://docs.mongodb.com/manual/tutorial/deploy-shard-cluster/)

完成后可以使用 `sh.status()` 来查看 sharding 集群是否正确。

### 导入初始数据，生成衍生表

使用 mongoimport 工具可以批量导入 json 数据，将使用 python 脚本生成的数据用如下指令导入:

```bash
# 以 user.dat 为例
mongoimport --db $(DB) --collection user --file $(INITDATA)/user.dat;
```

基于 gridfs 的多媒体数据可以使用 mongofiles 工具导入，使用如下 Makefile 命令：

```makefile
FILES := $(wildcard $(GRIDFS)/*/*)

gridfs:
	$(foreach f, $(FILES), \
        mongofiles \
            --host=${HOSTIP}:$(MONGOSPORT) \
            --local=$(f) \
            -d=$(DB) \
            put $(addsuffix .db, $(basename $(f)));)
```

这一步之后，连接 mongo, 使用 `show collections` 可以看到 `user`、`article`、`read` 三个初始表和多媒体数据。

然后使用一个 mongo 脚本 `drivate.js` 完成衍生表的生成。脚本简单描述如下。

#### 通过 shard tag 完成数据与节点的绑定

```javascript
// 首先允许 sharding
sh.enableSharding("ddbs")
// 为两个 dbms 建立 shard tag
sh.addShardTag("dbms1", "DBMS1")
sh.addShardTag("dbms2", "DBMS2")
// 以 user 表的配置为例：
// 先按照 region 和 uid 建立索引并建立 shrad 集合
// 然后使用 sh.addTagRange() 进行 shrad 集合与 dbms 的绑定 
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
// article 和 grid 配置同理
```

参考：[mongo官方](https://docs.mongodb.com/manual/tutorial/sharding-segmenting-shards/#procedure)

注意先关闭 shard balance 是为了保证设置期间不出现错误。

#### read 表的绑定

由于 read 需要按照 region 绑定，但 read 中本身并没有这一列，所以需要先进行一次 join，mongo 中可以用如下指令完成一次 join:

```javascript
db.read.aggregate([
        // 与 user 进行对 uid 的等值 join
        { $lookup: {from: "user", localField: "uid", foreignField: "uid", as: "tmp"}},
        { $set: { region: "$tmp.region"}},
        { $unwind: "$region"},
        { $unset: "tmp"},
        { $out: "read"}
    ],
    { allowDiskUse: true }
)
```

参考:[mongo官方](https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/)

#### beread 表的生成

首先，将 read 与 article join 得到带目录信息的 read_tmp，这与上一步类似，然后使用 group 得到 beread:

```javascript
db.read_tmp.aggregate([
        {
            $group: {
                // 按照 aid 进行归类
                _id: "$aid",
                aid: { $first: "$aid" },
                category: { $first: "$category" },
                // 取最后一次读的信息作为 beread 的时间戳
                timestamp: { $max: "$timestamp" },
                // 读取次数直接数个数
                readNum: { $sum: 1 },
                readUidList: { $addToSet: "$uid" },
                // 其他个数计数 xxxOrNot 转 int 后的值
                commentNum: { $sum: {$toInt: "$commentOrNot" } },
                // 使用　cond 可以达到 if-else 的判断效果
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
```

参考：[group](https://docs.mongodb.com/manual/reference/operator/aggregation/group/),[cond](https://docs.mongodb.com/manual/reference/operator/aggregation/cond/)

注意要允许使用磁盘，否则表过大的时候容易超过内存限制而报错。

这里对表 beread 表生成了 doread 表，方便查询每个用户的阅读信息，不要每次都 join。

#### pop-rank 的生成

以月度热度排序为例：

```javascript
db.read.aggregate([
        // 首先取出一些需要用到的列，其中　timestamp 转为 data
        { 
            $project: { 
                date: {$toDate: {$toLong: "$timestamp"}}, 
                aid: 1, 
                agreeOrNot: 1, 
                commentOrNot: 1, 
                shareOrNot: 1
            } 
        },
        // 从 data 中取出 year 和 month 的数据
        // 同时为每次阅读打分，这里一次 read / agree 得一分，comment / share 得四分
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
        // 按照 时间 和 aid 分类，同时计算出一个月内一片文章的总得分
        {
            $group: {
                _id: { year: "$year", month: "$month", aid: "$aid"},
                totalScore: { $sum: "$popScore" }
            }
        },
        // 再按照时间分类，得到一个月内所有的文章及其的分，接下来只要把文章按照的分排序就好了
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
// 对不同时间段的所有文章按照的分排序，使用一个空的 push 操作进行排序
db.pop_monthly.updateMany(
    {},
    {
        $push: {
            articles: {
                $each: [],
                // 按照分数降序排序
                $sort: { score: -1 },
            }
        }
    }
)
```

参考: [push](https://docs.mongodb.com/manual/reference/operator/update/push/)

同理可以生成所有的热度排序。

### 多媒体数据的读取

可以使用，mongofiles 从 gridfs 读取数据。参考：[mongofiles](https://docs.mongodb.com/database-tools/mongofiles/)

可以检查 `article0` 下的所有文件，然后 get 下载所需文件。

```
mongofiles --host=${HOSTIP}:$(MONGOSPORT) -d=$(DB) get $(file)
```

### read 表的监控与衍生表的自动更新

使用 python 脚本持续监控 read 表的插入操作，并自动更新 beread / doread / pop_xxx 等衍生表。

只需要执行 `python xxxwatch.py` 即可。

见 `scripts/watchread.py` 脚本:

#### read 插入操作的监控

```python
import pymongo
from pymongo import MongoClient
from datetime import datetime

client = pymongo.MongoClient('mongodb://' + HOSTIP + ':' + HOSTPORT)
db = client.ddbs
change_stream = db.read.watch([{'$match': {'operationType': 'insert'}}])

# 该 for 循环会等待 read 表的 insert 操作并得到 insert 内容
for change in change_stream:
    change = change['fullDocument']
```

#### beread 的更新

```python
    # beread 表更新如下，首先建立一个 dict 然后使用 update_one 接口完成更新
    update_dic = {
        "$max": {
            "timestamp" : change['timestamp']
        },
        "$inc": { 
            "readNum" : 1,
            "commentNum" : int(change['commentOrNot']),
            "agreeNum" : int(change['agreeOrNot']),
            "shareNum" : int(change['shareOrNot']),
        },
        "$addToSet": {
            "readUidList": change['uid'],
        }
    }
    # 这里就没必要使用 cond 了，使用 if 会更加方便。。(其实是使用 cond 报错了
    if change['commentOrNot'] == 1:
        update_dic["$addToSet"]["commentUidList"] = change['uid']

    if change['agreeOrNot'] == 1:
        update_dic["$addToSet"]["agreeUidList"] = change['uid']
    
    if change['shareOrNot'] == 1:
        update_dic["$addToSet"]["shareUidList"] = change['uid']
    # 更新 aid 匹配的 document
    db.beread.update_one(
        {"_id": change['aid']},
        update_dic,
    )
```

#### pop rank 的更新

用伪代码战士更新过程：

```python
    # 首先获取时间，来匹配不同时间段对应的 document
    year, month, week, day = get_time_from_timestamp()
    # 计算得到分数
    base_score = get_score_from_read_record()
    # 以 pop_monthly　为例，先尝试搜索对应时间的 doc
    doc = db.pop_monthly.find_one({ "_id": { "year": year, "month": month } })

    # 首先检查对应时间段的 doc 是否存在，若不存在，创建一个空的
    if doc == None:
        db.pop_monthly.insert_one(get_null_doc())
    else:
        exist, loc = find_in_doc(doc)
    # 若文章存在，更新第 loc 个 aritcle 的分数，并重新排序
    if exist == true:
        db.pop_monthly.update_article_score(doc_id, loc)
        db.pop_monthly.order(doc_id)
    # 若文章不存在，插入一篇文章并排序
    else:
        db.pop_monthly.insert_new_article(doc_id)
        db.pop_monthly.order(doc_id)
```

pop_weekly / pop_daily 同理。

## MANUAL

由于前端工作尚有欠缺，manual 比较简单，整理如下：

| 功能             | 指令                         | 说明            |
| ---------------- | ---------------------------- | --------------- |
| 系统启动与初始化 | make all                     | 根目录 makefile |
| 查看表单         | db.xxx.find().pretty()       | 连接 mongos     |
| 查看文章信息     | db.beread.find({aid: "xxx"}) | 连接 mongos     |
| 查看用户信息     | db.doread.find({uid: "xxx"}) | 连接 mongos     |
| 插入阅读记录     | db.read.insert({xxx})        | 连接 mongos      |
| 查看 2019 年 4 月的热度排序 | db.pop_monthly.find({_id: {year: 2019, month: 4}}).pretty() | 连接 mongos |
| 查看 2019 年 21 周的热度排序 | db.pop_weekly.find({_id: {year: 2019, week: 21}}).pretty() | 连接 mongos |
| 查看 2019 年 156 日的热度排序 | db.pop_weekly.find({_id: {year: 2019, day: 156}}).pretty() | 连接 mongos |
| 插入多媒体信息 | mongofiles --host=${HOSTIP}:$(MONGOSPORT) --local $(f) -d=$(DB) put $(file) | 本地 bash |
| 获取多媒体信息 | mongofiles --host=${HOSTIP}:$(MONGOSPORT) -d=$(DB) get $(file) | 本地 bash |