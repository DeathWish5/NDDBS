HOSTIP := 183.173.78.37
INITDATA := /initdata
SCRIPTS := /initdata
MONGOS_VOLUME_DIR := docker/volumes/mongos
DB := ddbs
BIGDATA := bigdata
FILES := $(wildcard $(BIGDATA)/*/*)
MONGOSPORT := 40000


all: dockerup mongo-init mongo-import big-data drivate watchread

dockerup:
	mkdir -p $(MONGOS_VOLUME_DIR)
	cp data-files/* $(MONGOS_VOLUME_DIR)
	cp scripts/* $(MONGOS_VOLUME_DIR)
	env HOSTIP=${HOSTIP} docker-compose -f docker/docker-compose.yaml up -d

mongo-init:
	docker exec -it cfg1 bash -c "mongo --eval 'rs.initiate({_id: \"cfg\", configsvr: true, members: [{ _id : 0, host : \"${HOSTIP}:40001\"}, { _id : 1, host : \"${HOSTIP}:40002\"}, { _id : 2, host : \"${HOSTIP}:40003\"}]})'"
	docker exec -it dbms1_svr1 bash -c "mongo --eval 'rs.initiate({_id: \"dbms1\", members: [{ _id : 0, host : \"${HOSTIP}:40004\" }, { _id : 1, host : \"${HOSTIP}:40005\" }, { _id : 2, host : \"${HOSTIP}:40006\" }]})'"
	docker exec -it dbms2_sv架子r1 bash -c "mongo --eval 'rs.initiate({_id: \"dbms2\", members: [{ _id : 0, host : \"${HOSTIP}:40007\" }, { _id : 1, host : \"${HOSTIP}:40008\" }, { _id : 2, host : \"${HOSTIP}:40009\" }]})'"
	docker exec -it grid_svr1 bash -c "mongo --eval 'rs.initiate({_id: \"grid\", members: [{ _id : 0, host : \"${HOSTIP}:40010\" }, { _id : 1, host : \"${HOSTIP}:40011\" }, { _id : 2, host : \"${HOSTIP}:40012\" }]})'"
	docker exec -it mongos bash -c "mongo --eval 'sh.addShard(\"dbms1/${HOSTIP}:40004\")'; mongo --eval 'sh.addShard(\"dbms1/${HOSTIP}:40005\")'; mongo --eval 'sh.addShard(\"dbms1/${HOSTIP}:40006\")';\
						mongo --eval 'sh.addShard(\"dbms2/${HOSTIP}:40007\")'; mongo --eval 'sh.addShard(\"dbms2/${HOSTIP}:40008\")'; mongo --eval 'sh.addShard(\"dbms2/${HOSTIP}:40009\")';\
						mongo --eval 'sh.addShard(\"grid/${HOSTIP}:40010\")'; mongo --eval 'sh.addShard(\"grid/${HOSTIP}:40011\")'; mongo --eval 'sh.addShard(\"grid/${HOSTIP}:40012\")'"

mongo-import:
	docker exec -it mongos bash -c "mongoimport --db $(DB) --collection user --file $(INITDATA)/user.dat;\
									mongoimport --db $(DB) --collection article --file $(INITDATA)/article.dat;\
									mongoimport --db $(DB) --collection read --file $(INITDATA)/read.dat"

drivate:
	docker exec -it mongos bash -c "mongo < $(SCRIPTS)/drivate.js"

big-data:
	$(foreach f, $(FILES), mongofiles --host=${HOSTIP}:$(MONGOSPORT) --local=$(f) -d=$(DB) put $(addsuffix .db, $(basename $(f)));)

watchread:
	python3 scripts/watchread.py &
	python3 scripts/watchberead.py &
	python3 scripts/watchDay.py &

clean:
	docker rm -f cfg1 cfg2 cfg3 dbms1_svr1 dbms1_svr2 dbms1_svr3 dbms2_svr1 dbms2_svr2 dbms2_svr3 grid_svr1 grid_svr2 grid_svr3 mongos
	rm -rf docker/volumes/*
