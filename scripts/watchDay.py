import pymongo
from pymongo import MongoClient
client = pymongo.MongoClient('mongodb://183.173.78.37:40000/')
db = client.ddbs
change_stream = db.pop_daily.watch()
for change in change_stream:
    # change = change['fullDocument']
    # {"timestamp": xx, "id": xx, "uid": xx, "aid": xx, "readTimeLength": xx, 
    #   "agreeOrNot": xx, "commentOrNot": xx, "shareOrNot": xx, "commentDetail": xx }

    print("change: ", change)