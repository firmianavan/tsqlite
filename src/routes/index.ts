
import * as express from 'express';
import * as crypto from 'crypto';
import { Database, Statement, RunResult } from 'sqlite3'
import { Parser} from 'json2csv'

const db: Database = new Database("data.db", errorHandler("create/open database"))

db.exec("create table if not exists item (serial text primary key,name text,passwd text, email text, phone text, regist_time text )", errorHandler("creating item"))
db.exec("create table if not exists usr (serial text, m INTEGER, d INTEGER, mi INTEGER )", errorHandler("creating usr"))
db.exec("create unique index if not exists usr_unique on usr (serial, d)", errorHandler("creating unique index on usr"))
db.exec("create index if not exists usr_m on usr (m)", errorHandler("creating month index on usr"))
db.exec("create table if not exists balance (serial text primary key, total Integer,latest Integer, monthly INTEGER, daily INTEGER )", errorHandler("creating balance"))

let t = new Date()
t.setDate(26)
t.setMonth(7)
for (let i = 0; i<42; i++){
    t.setDate(t.getDate()+1)
    let m = 19*100 + t.getMonth()+1
    let d = m*100 + t.getDate()
    db.exec(`insert into usr (serial,m,d,mi) values ('t',${m},${d},1) `)
}

db.on("error", function(sql: string):void {
    console.error("error ocurs executing : ", sql);
})
function errorHandler(msg: string): (this: Statement, err: Error | null) => void {
    return function (this: Statement, err: Error | null) {
        if (!!err) {
            console.error(`Error ocurs when ${msg}, error is: ${err}`)
        }
    }
}

import { IRoute, Router } from 'express-serve-static-core';

let router: Router = express.Router();



function formatDate(n: Date){
    return `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()} ${n.getHours()}:${n.getMinutes()}:${n.getSeconds()}`
}

router.get('/time', function (req, res, next) {
    console.log(req.params)
    console.log(req.body)
    // res.render('index', { title: 'Express' });
    let stmt = db.prepare("insert into usr (serial,m,d,mi) values (?,?/100,?,?) on conflict(serial,d) do update set mi = ?")

    let n = new Date()
    let ret = formatDate(n)
    console.log(ret)
    res.send(ret)
    // res.write(ret)

});

const k = 1000; //收益系数
function getherData(req: express.Request,res: express.Response){
    let n = Math.floor(req.query.strtime.length / 10)
    let stmt = db.prepare("insert into usr (serial,m,d,mi) values (?,?/100,?,?) on conflict(serial,d) do update set mi = ?")
    let bst = db.prepare("insert into \"balance\" (serial, total,latest, monthly,daily) values (?,?,?,?,?) on conflict(serial) do update set " +
        " total = case when latest > ?  then total when latest = ? then (total - daily + ?) else (total + ?) end," +
        " monthly = case when latest > ?  then monthly when latest = ? then (monthly - daily + ?) when latest/100 < ?/100 then ? else (monthly + ?) end," +
        " daily = case when latest > ?  then daily else ? end," +
        " latest = case when latest > ?  then latest else ? end")
    for (let i = n - 1; i >= 0; i--) {
        let day = req.query.strtime.substring(i * 10, i * 10 + 6)
        let minutes = req.query.strtime.substring(i * 10 + 6, i * 10 + 10)
        let mi = parseInt(minutes)
        if ( mi > 60*8 ) mi = 60 * 8 //大于八小时按八小时算
        let d = parseInt(day)
        let delta = mi * k
        stmt.run(req.query.serial, d, d, mi, mi)
        // do not deal with profit for now
        bst.run(req.query.serial, delta, d, delta, delta, d, d, delta, delta, d, d, delta, d, delta, delta, d, delta, d, d)
    }

    stmt.finalize(function (err: Error): void {
        //加密狗未提供参数返回的规则，只得按照example原样返回
        if (!!err) {
            console.error(err)
            res.send("<p>不相同")
        }
        bst.finalize(function (err: Error): void {
            if (!err) {
                res.send("<p>相同 changpasswordok ")
                return
            }
            console.error(err)
            res.send("<p>不相同")
        })
    })
}
router.get('/login', function (req, res, next) {

    console.log(req.query)
    if (!req.query.strtime || !req.query.serial || ! req.query.checkcode){
        res.status(400).send("Invalid Params")
    }
    let md5 = crypto.createHash('md5');
    var hashed = md5.update(req.query.strtime).digest('hex')
    console.log(hashed)
    //加密狗未提供参数返回的规则，只得按照example原样返回
    if (hashed !== req.query.checkcode) {
        res.send("<p>不相同")
        return
    }
    let regt = db.prepare("insert into item (serial,regist_time) values (?,?) on conflict(serial) do nothing")
    regt.run(req.query.serial,formatDate(new Date()))
    regt.finalize(function (err: Error): void {
        if (!!err) {
            console.error(err)
            res.send("<p>不相同")
            return
        }
        getherData(req,res)
    })
    // strtime: "190204000019020200021902010000", checkcode: "ae7e0006a63c858a5a164dba9e63c1fb", serial: "xjk12912800005
    // strtime: "190202000219020100000000", checkcode: "3db2e45e865352dd969bcb728eda8c41", serial: "xjk1291280000559"
    // strtime: "190201000000000000", checkcode: "7c145b3a2f5fc3dbee8060e0d8be4dda", serial: "xjk1291280000559"
    
});
router.get("/csv/download/:d", function (req, res) {
    if (req.params['d'].length !== 4){
        res.send("Invalid month, should like 1902")
        return 
    }
    let target: number
    try {
        target = parseInt(req.params['d'])
    } catch (error) {
        res.send("Invalid month, should like 1902")
        return 
    }
    let t = new Date()
    t.setDate(1)
    t.setMonth(target%100 - 1)
    t.setFullYear(2000+ Math.floor(target/100))
    let dayOfWeek = t.getDay() === 0? 7: t.getDay()
    let offset = dayOfWeek - 1
    let stmt = db.prepare("select serial as serial_no, m as month, sum(mi) as month_total, "
        + " sum(case when (d%100 -1 +?)/7 = 0 then mi else 0 end) as week_1 , "
        + " sum(case when (d%100 -1 +?)/7 = 1 then mi else 0 end) as week_2 , "
        + " sum(case when (d%100 -1 +?)/7 = 2 then mi else 0 end) as week_3 , "
        + " sum(case when (d%100 -1 +?)/7 = 3 then mi else 0 end) as week_4 , "
        + " sum(case when (d%100 -1 +?)/7 = 4 then mi else 0 end) as week_5 , " 
        + " sum(case when (d%100 -1 +?)/7 = 5 then mi else 0 end) as week_6  from usr where m = ? group by serial, m ",offset,offset,offset,offset,offset,offset, req.params['d'])
    stmt.all(function (err: Error | null, rows: any[]) {
        if (!!err) {
            res.write(`failed to fetch result, ${err}`)
        } else if (rows.length === 0) {
            res.write(`cannot find any record`)
        } else {
            res.setHeader('Content-disposition', `attachment; filename=user-stastics.csv`);
            res.writeHead(200, { 'Content-Type': 'text/csv;charset=utf-8' });
            let parser = new Parser()
            let ret = parser.parse(rows)
            res.write(ret)
        }
        res.end()
    })
})
router.get("/csv/show", function (req, res) {

    let stmt = db.prepare("select serial as serial_no,  regist_time  from item order by regist_time")
    stmt.all(function (err: Error | null, rows: any[]) {
        if (!!err) {
            res.send(`failed to fetch result, ${err}`)
        } else if (rows.length === 0) {
            res.send(`cannot find any record`)
        } else {
            res.send(rows)
        }
    })
})
router.get("/profit/show/:d", function (req, res) {
    let stmt = db.prepare("select * from balance where serial = ?", req.params['d'])
    stmt.all(function (err: Error | null, rows: any[]) {
        if (!!err) {
            res.send(`failed to fetch result, ${err}`)
        } else if (rows.length === 0){
            res.send(`cannot find serial ${req.params['d']} from database`)
        } else {
            res.send(rows[0])
        }
    })
})

module.exports = router;
