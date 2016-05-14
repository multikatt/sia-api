module.exports = Sia;

var _ = require("underscore");
var request = require("request");

function Sia(config) {
	var self = this;
	var host_ = config.host;

	var defs = [
		"get:/daemon/constants",
		"get:/daemon/stop",
		"get:/daemon/version",
		"get:/consensus",
		"get:/explorer",
		"get:/blocks",
		"get:/hashes",
		"get:/gateway",
		"get:/gateway/add",
		"get:/gateway/remove",
		"get:/host",   // !!!
		"post:/host",  // !!!
		"post:/host/announce",
		"post:/host/delete",
		"get:/miner",
		"get:/miner/start",
		"get:/miner/stop",
		"get:/miner/header",
		"post:/miner/header",
		"get:/renter/allowance",
		"post:/renter/allowance",
		"get:/renter/downloads",
		"get:/renter/files",
		"post:/renter/load",
		"post:/renter/loadascii",
		"get:/renter/share",
		"get:/renter/shareascii",
		"post:/renter/delete/*",
		"get:/renter/download/*",
		"post:/renter/rename/*",
		"post:/renter/upload/*",
		"get:/renter/hosts/active",
		"get:/renter/hosts/all",
		"get:/transactionpool/transactions",
		"get:/wallet",
		"get:/wallet/address",
		"get:/wallet/addresses",
		"get:/wallet/backup",
		"post:/wallet/init",
		"post:/wallet/lock",
		"post:/wallet/seed",
		"get:/wallet/seeds",
		"post:/wallet/siacoins",
		"post:/wallet/siafunds",
		"post:/wallet/siagkey",
		"get:/wallet/transaction/*",
		"get:/wallet/transactions/+",
		"post:/wallet/unlock",
	]

	var ARGS_IN_PATH_REQ = 1;
	var ARGS_IN_PATH_OPT = 2;

	var ifacePathMap = { }
	var iface = { }

	_.each(defs, function(op) {
	
		var p = op.split(':');
		var method = p.shift();
		var path = p.shift();
		var parts = path.split('/');
		parts.shift();

		var argsInPath = null;
		if(parts[parts.length-1] == '*') {
			argsInPath = ARGS_IN_PATH_REQ;
			parts.pop();
			path = '/'+parts.join('/');
		}
		else
		if(parts[parts.length-1] == '+') {
			argsInPath = ARGS_IN_PATH_OPT;
			parts.pop();
			path = '/'+parts.join('/');
		}


		var last = iface;
		var part = parts.shift();
		while(part) {
			if(parts.length) {
				if(!last[part])
					last[part] = { }
				last = last[part];
				part = parts.shift();
			}
			else {
				var fn = config.rpc ? createProxyFn(method,path) : createFn(method,path,argsInPath);
								
				if(!last[part])
					last[part] = fn;//{ }
				last[part][method] = fn;
				part = null;

				if(!ifacePathMap[path])
					ifacePathMap[path] = { }
				ifacePathMap[path][method] = fn;
			}
		}

		_.each(iface, function(o, n) {
			self[n] = o;
		})

	})


	function createProxyFn(method, path) {

		var fn = function() {

			var args = Array.prototype.slice.apply(arguments);

			var callback = args.pop();
			if(!_.isFunction(callback)) {
				console.log("No callback supplied to Sia function "+path);
				throw new Error("No callback");
			}

			config.rpc.dispatch({
				op : 'sia-rpc',
				method : method,
				path : path,
				args : args
			}, callback);
		}

		return fn;
	}

	function createFn(method, path, argsInPath) {

		var url = host_+path;

		var options = {
            json : true,
            headers : {
            	"User-Agent" : "Sia-Agent"
            }
		}

		var fn = function() {

			options.url = url;

			var args = Array.prototype.slice.apply(arguments);

			var callback = args.pop();
			if(!_.isFunction(callback)) {
				console.log("No callback supplied to Sia function "+path);
				throw new Error("No callback");
			}

			if(argsInPath == ARGS_IN_PATH_REQ && !args.length) {
				console.log("No sub-path supplied to Sia function "+path);
				return callback("No sub-path");
			}
			else
			if(argsInPath && args.length) {
				var path = args.shift();
				options.url += path.charAt(0) == '/' ? path : '/'+path;
			}			

			if(method == "get") {
				options.method = "GET";
				if(args.length)
				options.qs = args.shift();
			}
			else {
				options.method = "POST";
				options.body = args.shift();
			}

			request(options, function(err, response, body) {
	            if(err) 
	                return callback(err);

			    if(response.statusCode !== 200)
			        return callback('Invalid Status Code Returned:' + response.statusCode);
		
			    callback(null, body);
	        })

	    }

	    return fn;
	}

	// --- iris-rpc bindings

	config.rpc && config.rpc.on('set-sia-host', function(op, callback) {
		self.setSiaHost(op.host);
		callback && callback();
	})

	config.rpc && config.rpc.on('sia-rpc', function(op, callback) {
		if(!op.method || !op.path)
			return callback("Missing method and path arguments");

		fn = ifacePathMap[op.path][op.method];
		if(!fn)
			return callback("No such method '"+op.method+"' in path '"+op.path+"'");

		var args = op.args || [ ];
		args.push(callback);
		fn.apply(last, args);
	})

	// --- utility functions

	self.H_TO_S = function(h) { return h / 1e24; }
	self.H_B_BLOCK_TO_S_GB_MONTH = function(h) { return h * 1e9 * 4320 / 1e24; }

	self.setSiaHost = function(host) {
		host_ = host;
	}

	self.getActiveHostPriceList = function(callback) {
		self.renter.hosts.active(function(err, resp) {
			if(err)
				return callback(err);

			var list = _.map(resp.hosts, function(host) { return parseFloat(host.price); })

			callback(null, list);
		});

	}

	self.getAvgActiveHostPrice = function(callback) {

		self.renter.hosts.active(function(err, resp) {
			if(err)
				return callback(err);

			var price = 0
			_.each(resp.hosts, function(h) {
				price += parseFloat(h.price);
			})
			price /= resp.hosts.length;

			callback(null, self.H_B_BLOCK_TO_S_GB_MONTH(price));
		});
	}
}