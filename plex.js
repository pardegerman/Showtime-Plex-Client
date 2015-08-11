/**
 *  Movian plugin for Plex
 *  Original version for showtime v 3 by Björn Dahlgren (bjorn@dahlgren.at)
 *  updated for movian v 4.10 by Pär Degerman (par@degerman.org)
 *
 *  Copyright 2011 Björn Dahlgren
 *  Copyright 2015 Pär Degerman
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

var XML = require('showtime/xml');
 
(function(plugin) {

	this.authUrl = "https://plex.tv/users/sign_in.xml";
	this.currentServerUrl;
	this.currentServerToken;
	this.myPlexToken;

    /**
     * Display title for video during playback
     *
     * @param url URL to video
     * @param title Title of video (to display in controls)
     */
    function getVideo(url, title) {
        return "videoparams:" + showtime.JSONEncode({
            title: title,
            canonicalUrl: url,
            sources: [{
                url: url
            }]
        });
    }

    /**
     * Get available icon from backend or use the Plex logo
     *
     * @param item XML element to search for an image
     */
    function getIcon(item) {
	if (item['@thumb'])
            return get_image_url(item['@thumb']);
        if (item['@art'])
            return get_image_url(item['@art']);
        if (item['@banner'])
            return get_image_url(item['@banner']);
	return plugin.path + "plex-logo.png";
    }

    /*
     * View for a TV Show, lists seasons
     */
    plugin.addURI("plex:show:([a-z0-9\/]*)", function(page, key) {            
        page.contents = "items";
        page.type = "directory";

	var doc = XML.parse(request_directory(key));

        page.metadata.logo = getIcon(doc);
        page.metadata.title = doc.MediaContainer['@title2'];

	var seasons = doc.MediaContainer.filterNodes('Directory');
        for (var i = 0; i < seasons.length; i++) {
	    var season = seasons[i];
            var metadata = {
                title: season['@title'],
                description: season['@summary'],
                icon: getIcon(season)
            };
            page.appendItem("plex:season:" + season['@key'], "directory", metadata);
        };
        page.loading = false;
    });

    /*
     * View for a TV season, lists episodes
     */
    plugin.addURI("plex:season:([A-Za-z0-9\/]*)", function(page, key) {            
        page.contents = "video";
        page.type = "directory";

        var doc = XML.parse(request_directory(key));

        page.metadata.logo = getIcon(doc);
        page.metadata.title = doc.MediaContainer['@title2'];
        
        var showName;
        if (doc.MediaContainer['@parentTitle'])
            showName = doc.MediaContainer['@parentTitle'];
        else
            showName = doc.MediaContainer['@title2'];

	var videos = doc.MediaContainer.filterNodes('Video');
        for (var i = 0; i < videos.length; i++) {
	    var video = videos[i];
            var numbering;
            if (video['@parentIndex'])
                numbering = video['@parentIndex'] + "x" + video['@index'];
            else
                numbering = doc.MediaContainer['@parentIndex'] + "x" + video['@index'];
            
            var title = numbering + " - " + video['@title'];
            var metadata = {
                title: title,
                description: video['@summary'],
                duration: showtime.durationToString(parseInt(video['@duration']) / 1000),
                icon: getIcon(video)
            };
            var url = get_video_url(video.Media.Part['@key']);
            page.appendItem(getVideo(url, showName + " - " + title), "video", metadata);
        }
        page.loading = false;
    });

    plugin.addURI("plex:section:([0-9]*)", function(page, section) {            
        page.type = "directory";

        var doc = XML.parse(request_directory("/library/sections/" + section + "/all/"));

        page.metadata.logo = plugin.path + "plex-logo.png";
        page.metadata.title = doc.MediaContainer['@title1'];

        if (doc.MediaContainer['@viewGroup'] == "movie") {
            page.contents = "video";

	    var videos = doc.MediaContainer.filterNodes('Video');
            for (var i = 0; i < videos.length; i++) {
		var video = videos[i];
                var metadata = {
                    title: video['@title'],
                    description: video['@summary'],
                    duration: showtime.durationToString(parseInt(video['@duration']) / 1000),
                    icon: getIcon(video)
                };
                var url = get_video_url(video.Media.Part['@key']);
                page.appendItem(getVideo(url, video['@title']), "video", metadata);
            }
        } else if (doc.MediaContainer['@viewGroup'] == "show") {
            page.contents = "items";
	    var shows = doc.MediaContainer.filterNodes('Directory');
            for (var i = 0; i < shows.length; i++) {
		var show = shows[i];
                var metadata = {
                    title: show['@title'],
                    description: show['@summary'],
                    icon: getIcon(show)
                };
                page.appendItem("plex:show:" + show['@key'], "directory", metadata);
            }
        }
        page.loading = false;
    });

    plugin.addURI("plex:start:(.*):(.*):([0-9]*)", function(page, token, host, port) {            
        page.type = "directory";
        page.contents = "items";
        
        this.currentServerUrl = "http://" + host + ":" + port;
        this.currentServerToken = token;

	var doc = XML.parse(request_directory("/library/sections/"));

        page.metadata.logo = plugin.path + "plex-logo.png";
        page.metadata.title = doc.MediaContainer["@title1"];

	var directories = doc.MediaContainer.filterNodes('Directory');
	for (var i = 0; i < directories.length; i++) {
	    var section = directories[i];
            var metadata = {
                title: section["@title"],
                icon: getIcon(section)
            };
            page.appendItem("plex:section:" + section["@key"], "directory", metadata);
        }
        page.loading = false;
    });
    
    plugin.addURI("plex:auth", function(page) {
	var deviceID = showtime.deviceId;
	var response = showtime.httpReq(authUrl, {
	    debug: true,
	    method: 'POST',
	    headers: {
	        'X-Plex-Client-Identifier': deviceID,
		'X-Plex-Product': 'movian Plex Plugin'
	    }
	});
	var doc = XML.parse(response);
	this.myPlexToken = doc.user['@authenticationToken'];
	
	var serversURL = "https://plex.tv/pms/servers.xml";
	response = showtime.httpReq(serversURL, {
	    debug: true,
	    args: {
	        'auth_token': this.myPlexToken
	    }
	});

	var doc = XML.parse(response);
    	    	    
	page.type = "directory";
        page.contents = "items";
	page.metadata.title = "myPlex Servers";

	var servers = doc.MediaContainer.filterNodes('Server');
	for(var i = 0; i < servers.length; i++) {
	    var server = servers[i];
            var metadata = {
                title: server["@name"]
            };
	    var token = server["@accessToken"];
            if (!token) token = this.myPlexToken;
            
            var path = "plex:start:" + token + ":" + server["@host"] + ":" + server["@port"];
	    page.appendItem(path, "directory", metadata);
        }
        page.loading = false;
    });
    
    plugin.addHTTPAuth(authUrl, function(authreq) {
    	var auth = plugin.getAuthCredentials("My Plex", "We need to authenticate with myPlex", false);
	var authData = "Basic " + base64_encode(auth.username + ":" + auth.password);
	authreq.rawAuth(authData);
    });

    plugin.URIRouting = true;
    plugin.createService("Plex", "plex:auth", "video", true, plugin.path + "plex-logo.png");
    
    function request_directory(url) {
        return showtime.httpReq(currentServerUrl + url, {
	    args: {
	        "X-Plex-Token": currentServerToken
	    }
	});
    }
    
    function get_image_url(url) {
	    return this.currentServerUrl + url + "?X-Plex-Token=" + currentServerToken;
    }
    
    function get_video_url(url) {
	    return this.currentServerUrl + url + "?X-Plex-Token=" + currentServerToken;
    }

    function base64_encode (data) {
	    // Encodes string using MIME base64 algorithm  
	    // 
	    // version: 1109.2015
	    // discuss at: http://phpjs.org/functions/base64_encode
	    // +   original by: Tyler Akins (http://rumkin.com)
	    // +   improved by: Bayron Guevara
	    // +   improved by: Thunder.m
	    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	    // +   bugfixed by: Pellentesque Malesuada
	    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	    // +   improved by: Rafał Kukawski (http://kukawski.pl)
	    // -    depends on: utf8_encode
	    // *     example 1: base64_encode('Kevin van Zonneveld');
	    // *     returns 1: 'S2V2aW4gdmFuIFpvbm5ldmVsZA=='
	    // mozilla has this native
	    // - but breaks in 2.0.0.12!
	    //if (typeof this.window['atob'] == 'function') {
	    //    return atob(data);
	    //}
	    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
	    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
	        ac = 0,
	        enc = "",
	        tmp_arr = [];
	 
	    if (!data) {
	        return data;
	    }
	 	 
	    do { // pack three octets into four hexets
	        o1 = data.charCodeAt(i++);
	        o2 = data.charCodeAt(i++);
	        o3 = data.charCodeAt(i++);
	 
	        bits = o1 << 16 | o2 << 8 | o3;
	 
	        h1 = bits >> 18 & 0x3f;
	        h2 = bits >> 12 & 0x3f;
	        h3 = bits >> 6 & 0x3f;
	        h4 = bits & 0x3f;
	 
	        // use hexets to index into b64, and append result to encoded string
	        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
	    } while (i < data.length);
	 
	    enc = tmp_arr.join('');
	    
	    var r = data.length % 3;
	    
	    return (r ? enc.slice(0, r - 3) : enc) + '==='.slice(r || 3);
	}

})(this);
