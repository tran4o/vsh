var htmlToText = require('html-to-text');
var request = require('request');
var readlineSync = require('readline-sync');
var readline = require('readline');
var colors = require('colors');
var params = process.argv.slice();
var http = require('http');
//--------------------
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
if (params[0] == "node")
	params.shift();
if (params[0] && (params[0].endsWith("/vsh") || params[0].endsWith("\\vsh")))
	params.shift();
//--------------------
var pingtime = 500;
var isLogFull = false;
var port = 8182;
var login = "admin";
var pass;
var server;
//--------------------
function eatParam() {
	return params.shift();
}
function getParam() {
	return params[0];
}
var key;
var host;
var type="";
do 
{
	var cmd = eatParam();
	if (!cmd)
		break;
	if (cmd == "-h") {
		console.log("vsh host[:port] [options]");
		console.log(colors.gray(" <port>"));
		console.log(colors.gray("-t [type (raw (default)/vscript/xml/xmlo)]"));
		console.log(colors.gray("-stop"));
		console.log(colors.gray("-u <user login>"));
		console.log(colors.gray("-p [<password>]"));
		console.log(colors.gray("-k <name keyword>"));
		console.log(colors.gray("-L"));
		return;	
	}
	if (cmd == "-t") {
		type=eatParam();
		if (type == "vscript" || type == "xml" || type == "xmlo") {} else type="";
	} if (cmd == "-L") {
		isLogFull=true;
	} else if (cmd == "-k") {
		key=eatParam();
	} else if (cmd == "-u") {
		login=eatParam();
	} else if (cmd == "-p") {
		pass="";
		if (getParam() && getParam().length && getParam()[0] != "-") {
			pass=eatParam();
		}
	} else if (!host && cmd.length && cmd[0] != "-") {
		host=cmd;
	}
} while (true);

if (!host) {
	console.log(colors.gray("HOST not provided!"));
	return;
}
if (host.indexOf(":")) {
	var t = host.indexOf(":");
	port = parseInt(host.substring(t+1));
	host = host.substring(0,t);
}
if (pass != undefined) 
{
	if (pass == "") 
	{
		pass = readlineSync.question('password: ',{
			  hideEchoBack: true // The typed text on screen is hidden by `*` (default). 
		});
		if (!pass) 
		{			
			console.log(colors.red("User login not provided!"));
			return;
		}
	} 
}
if (login && pass) {
	console.log(colors.gray("Using manager ")+host+colors.gray(" port ")+port+colors.gray(" login ")+colors.green(login)+( pass ? colors.gray(" with password ") : ""));
} else {
	console.log(colors.gray("Using manager ")+host+colors.gray(" port ")+port);
}
//----------------------------------------------
var auth = 'Basic ' + new Buffer(login + ':' + pass).toString('base64');
request({
	  url: "http://"+host+":"+port+"/get-servers.jsp",
	  method: 'GET',
	  data: {mode:"basic"},
	  headers : {
		  'Authorization': auth
	  }
	}, function(err, res, body) 
{
		if (err) {
			console.log(colors.red(err));
			return;
		}
		if (body.indexOf("<!DOCTYPE") == 0) {
			console.log(colors.red("Authentification error!"));
			return;
		}
		var servers={};
		function addServer(id,name,serverPath,JVMMemory,installationXCONF,jar,started,autostart,jre) {
			if (!started)
				return;
			if (!key || name.toLowerCase().indexOf(key.toLowerCase()) >= 0) {
				servers[id]=name;
			}
		}
		var VISIONR = new Object();
		VISIONR.addServer=addServer;
		VISIONR.clearServers=function(){};		
		eval(body);
		//---------------
		var kk = Object.keys(servers);
		if (!kk.length) {
			console.log(colors.red("No VisionR servers available!"));
			process.exit(1);
		} else {
			if (kk.length != 1) {
				console.log(colors.gray("More than one server available. Please specify a search keyword (-k <name key>)"));
				console.log("");
				for (var i in kk) {
					console.log(colors.green(servers[kk[i]]));
				}
				return;
			}
		}
		server = kk[0];
		var sname = servers[server];
		//---------------
		console.log(colors.gray("Using server ")+colors.white(sname)+colors.gray(" | id="+server));
		doWork();
});
//-----------------------------------------
var buff=[];
var ctime;
var maxconst = 999999999999;

function exec(cmd) 
{
	request(
	{
		url: "http://"+host+":"+port+"/exec.jsp?id="+server,
		method: 'POST',
		headers:{'content-type': 'text/plain; charset=utf-8','Authorization': auth},
		body:type+cmd
	},
	  function(err,res,body) 
	  {
		if (err) {
			console.log(colors.red(err));
			process.exit(0);
			return;
		}
	  }
	);
}

var workQueue = [];
var working=false;
var afterWorkDone;
function doInput(str,tm) 
{
	//console.log(colors.cyan("LEN="+str.length+" | "+tm));
	if (str == "")
		return;
	function chkStr(ln) 
	{
		if (!working) {
			return;
		}
		var tt = ln.indexOf("-------Command-execution-time-was-");
		if (tt < 0)
			tt = ln.indexOf("-------Wait server to finish loading first!");
		if (tt >= 0)
		{
			console.log(colors.green("DONE!"));
			if (workQueue.length) {
				var el = workQueue.shift();
				cmd(el);
			} else {
				working=false;
				if (afterWorkDone)
					afterWorkDone();
			}
		}
	}
	var arr = str.split("\n");
	for (var i=0;i<arr.length;i++) 
	{
		var ln = arr[i];
		if (isLogFull || ln.indexOf("[error:") != 0) 
		{
			console.log(colors.yellow(ln));
			//rlbuf.push(ln);
			chkStr(ln);
		}
	}
}

var isPing=false;
function getLog() {
	//console.log(colors.red("GET TS="+(ctime ? ctime : maxconst)));
	request({
		  url: "http://"+host+":"+port+"/get-data.jsp",
		  method: 'GET',
		  qs: { d : server+":"+(ctime ? ctime : maxconst)},
		  headers : {
			  'Authorization': auth
		  }
		}, function(err, res, body) 
	{
			var VISIONR={onChangeServerState : function() {}};
			this.getServers = function() {
				return {
					toArray : function() {
						return [{
							processServerData : function(res,tm,started) 
							{
								if (!ctime) {
									ctime=tm;
									doInit();
								}
								else 
									ctime=tm;
								var text = htmlToText.fromString(res, {});
								doInput(text,tm);
							}	
							,getId : function() {
								return server;
							}
						}];
					} 
				};
			} 
			if (err) {
				console.log(colors.red(err));
				process.exit(0);
				return;
			}
			//console.log(body);
			try {
				eval(body);
			} catch (e) {
				console.log(colors.red("Error evaluating get-data script : "+e));
				console.log(colors.gray(body));
			}			
			if (isPing)
				setTimeout(getLog,pingtime);
	});
}

function doWork() {
	getLog();	
}

function startWork() 
{
	var rl;
	if (!process.stdin.isTTY) {
		rl = readline.createInterface({
			  input: process.stdin
			});
	} else {
		rl = readline.createInterface({
			  input: process.stdin,
			  output: process.stdout
			});
	}
	rl.on('line', function (cmd) {
		buff.push(cmd);
	}).on('close', function() {
		  doProcess();
		  if (!process.stdin.isTTY) 
		  {
			  if (!working) {
				  process.exit(0);
			  } else {
				  afterWorkDone=function() {
					  process.exit(0);
				  };
			  }
		  }
		  startWork();
	}).on('SIGINT', function() {
		  console.log(colors.gray('exiting...')); 
		  process.exit(0);
	});
}


function doInit() 
{
	console.log(colors.gray("Starting log stream.."));
	isPing=true;
	startWork();
}

function doProcess() 
{
	var cmd = buff.join("\n");
	buff=[];
	if (!cmd.trim().length)
		return;
	if (working)
		workQueue.push(cmd);
	else {
		working=true;
		exec(cmd);
	}
}

