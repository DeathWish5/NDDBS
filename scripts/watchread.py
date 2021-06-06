import pymongo
from pymongo import MongoClient
from datetime import datetime

client = pymongo.MongoClient('mongodb://183.173.78.37:40000/')
db = client.ddbs
change_stream = db.read.watch([{'$match': {'operationType': 'insert'}}])

print("GOGOGO watch read")

for change in change_stream:
    change = change['fullDocument']
    # {"timestamp": xx, "id": xx, "uid": xx, "aid": xx, "readTimeLength": xx, 
    #   "agreeOrNot": xx, "commentOrNot": xx, "shareOrNot": xx, "commentDetail": xx }

    print("change: ", change)

    # update beread
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

    if change['commentOrNot'] == 1:
        update_dic["$addToSet"]["commentUidList"] = change['uid']

    if change['agreeOrNot'] == 1:
        update_dic["$addToSet"]["agreeUidList"] = change['uid']
    
    if change['shareOrNot'] == 1:
        update_dic["$addToSet"]["shareUidList"] = change['uid']

    db.beread.update_one(
        {"_id": change['aid']},
        update_dic,
    )

    # update doread
    update_dic = {
        "$inc": { 
            "readNum" : 1,
            "commentNum" : int(    # update beread
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

    if change['commentOrNot'] == 1:
        update_dic["$addToSet"]["commentUidList"] = change['uid']

    if change['agreeOrNot'] == 1:
        update_dic["$addToSet"]["agreeUidList"] = change['uid']
    
    if change['shareOrNot'] == 1:
        update_dic["$addToSet"]["shareUidList"] = change['uid']

    db.beread.update_one(
        {"_id": change['aid']},
        update_dic,
    )change['commentOrNot']),
            "agreeNum" : int(change['agreeOrNot']),
            "shareNum" : int(change['shareOrNot']),
        },
        "$addToSet": {
            "readUidList": change['aid'],
        }
    }

    if change['commentOrNot'] == 1:
        update_dic["$addToSet"]["commentUidList"] = change['aid']

    if change['agreeOrNot'] == 1:
        update_dic["$addToSet"]["agreeUidList"] = change['aid']
    
    if change['shareOrNot'] == 1:
        update_dic["$addToSet"]["shareUidList"] = change['aid']

    db.doread.update_one(
        {"_id": change['uid']},
        update_dic,
    )

    time = datetime.fromtimestamp(int(change['timestamp']) / 1000)
    # ref: https://docs.python.org/3/library/time.html#time.struct_time
    year = time.timetuple()[0] # 0 = year
    month = time.timetuple()[1] # 1 = month
    week = time.isocalendar()[1] # 1 = week
    day = time.timetuple()[7] # 7 = dayofyear
    base_score = 1 + 4* int(change['commentOrNot']) + int(change['agreeOrNot']) + 4 * int(change['shareOrNot'])

    # update pop_monthly
    docu = db.pop_monthly.find_one({ "_id": { "year": year, "month": month } })

    score = base_score
    loc = -1

    if docu == None:
        db.pop_monthly.insert_one(
            {
                "_id": { "year": year, "month": month },
                "articles": []
            }
        )
    else:
        for idx, article in enumerate(docu['articles']):
            if article['aid'] == change['aid']:
                score += article['score']
                loc = idx
                break

    if loc > 0:
        db.pop_monthly.update_one(
            {"_id": { "year": year, "month": month } },
            {
                "$set": { "articles." + str(loc) + ".score": score },
            }
        )
        db.pop_monthly.update_one(
            {"_id": { "year": year, "month": month } },
            {
                "$push": { 
                    "articles": {
                        "$each": [],
                        "$sort": { "score": -1 }
                    }
                }
            }
        )
    else:
        db.pop_monthly.update_one(
            {"_id": { "year": year, "month": month } },
            {
                "$push": {
                    "articles": { 
                        "$each" : [{ 'aid': change['aid'], 'score': score }],
                        "$sort" : { 'score': -1 },
                    }
                }
            }
        )
    
    # update pop_weekly
    docu = db.pop_weekly.find_one( { "_id": { "year": year, "week": week } } )
    score = base_score
    loc = -1
    if docu == None:
        db.pop_monthly.insert_one(
            {
                "_id": { "year": year, "week": week },
                "articles": []
            }
        )
    else:
        for idx, article in enumerate(docu['articles']):
            if article['aid'] == change['aid']:
                score += article['score']
                loc = idx
                break

    if loc > 0:
        db.pop_weekly.update_one(
            {"_id": { "year": year, "week": week } },
            {
                "$set": { "articles." + str(loc) + ".score": score },
            }
        )
        db.pop_weekly.update_one(
            {"_id": { "year": year, "week": week } },
            {
                "$push": { 
                    "articles": {
                        "$each": [],
                        "$sort": { "score": -1 }
                    }
                }
            }
        )
    else:
        db.pop_weekly.update_one(
            {"_id": { "year": year, "week": week } },
            {
                "$push": {
                    "articles": { 
                        "$each" : [{ 'aid': change['aid'], 'score': score }],
                        "$sort" : { 'score': -1 },
                    }
                }
            }
        )
    
    # update pop_daily
    docu = db.pop_daily.find_one( { "_id": { "year": year, "day": day } } )
    score = base_score
    loc = -1
    if docu == None:
        db.pop_daily.insert_one(
            {
                "_id": { "year": year, "day": day },
                "articles": []
            }
        )
    else:
        for idx, article in enumerate(docu['articles']):
            if article['aid'] == change['aid']:
                score += article['score']
                loc = idx
                break

    if loc > 0:
        db.pop_daily.update_one(
            {"_id": { "year": year, "day": day } },
            {
                "$set": { "articles." + str(loc) + ".score": score },
            }
        )
        db.pop_daily.update_one(
            {"_id": { "year": year, "day": day } },
            {
                "$push": { 
                    "articles": {
                        "$each": [],
                        "$sort": { "score": -1 }
                    }
                }
            }
        )
    else:
        db.pop_daily.update_one(
            {"_id": { "year": year, "day": day } },
            {
                "$push": {
                    "articles": { 
                        "$each" : [{ 'aid': change['aid'], 'score': score }],
                        "$sort" : { 'score': -1 },
                    }
                }
            }
        )
