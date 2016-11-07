///three.js/build/three.min.js, and three.js/examples/js/controls/TrackballControls.js are required in the HTML code
///
///Setup:
///KLAMPT.init(sceneArea,textArea);  //run this when the document is loaded
///KLAMPT.windowResize(w,h);    //set the width/height
///KLAMPT.connect(addr,boilerplate,onconnect,onfailure);  //tries connecting to the given address.  If onconnect or onfailure are not null, they are callbacks that are called on connection success / failure
///KLAMPT.setCode(code,callback);        //sets the current client code.  The boiler plate must be set first.  callback is called when the scene is available
///
///Detailed connection management:
///KLAMPT.isConnected();
///KLAMPT.disconnect(ondisconnect); //ondisconnect is either null or a function that is called once disconnected
///You can also use the functions in DaveWebsocket.js waitForConnection / waitForDisconnection.
///
///Animation:
///KLAMPT.advance(callback);    //requests an advance of the frame.  callback is either null or a function that is called when the frame arrives and is drawn.
///KLAMPT.animate(running);     //requests continual advancing of frames.  running is either true or false
///
///Timing: be careful about calling isConnected, advance, setBoilerplate, and setCode if you do not first verify
///that the connection is up.  E.g., for startup it is safest to call
///
///  KLAMPT.connect(addr,boilerplate,function() { KLAMPT.setCode(code); },null);
///
///to start up the connection
///
///Low level scene control:
///KLAMPT.set_scene(scene);      //from a Three.js model object, reloads the scene
///KLAMPT.set_transforms(data);  //from a list of objects containing names / transforms, sets the transforms of the corresponding items in the scene
///KLAMPT.rpc(request);          //performs an RPC call from a kviz request object



var KLAMPT = (function(){




function Network(URI, newSceneArrivedCallback, consoleTextArrivedCallback, consoleErrorArrivedCallback)
{
   console.log("creating new network object for websocket use");     

   this.URI = URI;
   this.websocket = null;
   this.intervalId = null;
   this.newSceneArrivedCallback=newSceneArrivedCallback;
   this.consoleTextArrivedCallback=consoleTextArrivedCallback;
   this.consoleErrorArrivedCallback=consoleErrorArrivedCallback;
   
   //this.editor = editor;
   this.disconnectionAsked = false;
   
   this.connect();
   net_updateSocketState();    
}

Network.prototype.connect = function()
{
   console.log("Attempting to setup connection to: " + this.URI);

   this.disconnectionAsked = false;

   try
   {
      if (this.websocket)
      {
         if (this.connected())
         {
            this.websocket.close();
         }
         delete this.websocket;
      }
   
      if (typeof MozWebSocket === 'function')
      {
         WebSocket = MozWebSocket;
      }
      
      this.websocket = new WebSocket(this.URI, ['binary','base64']);
      
      this.websocket.onopen = function(evt)
      {
         console.log("websocket callback onopen");
         net_updateSocketState(this.websocket);
      }.bind(this);
      
      this.websocket.onclose = function(evt)
      {
         console.log("websocket callback onclose");
               
         net_updateSocketState(this.websocket);
         if (!this.disconnectionAsked)
         {
            //setTimeout(this.connect.bind(this), 500);
         }
         delete this.websocket;
      }.bind(this);  
      
      this.websocket.onmessage = function(evt) //this is where the webpage receives data from remote
      {
         //console.log("websocket callback onmessage");     
                 
    if(evt.data instanceof ArrayBuffer)
         {        
            console.log("  got an ArrayBuffer");
            console.log("    data length: " + evt.data.byteLength);           
         }
         else if(evt.data instanceof Blob)
         { 
            console.log("looks like its a Blob!");              
     
            console.log("filename: " + evt.data.name);            
            editor.loader.loadFile(evt.data);
         }
         else if(evt.data instanceof String)
         {
            console.log("its a string!");
         }
   
         else
         {        
            //console.log("  message is text");
            var message=evt.data;
            //console.log("raw message is: " + message);
            var slicedMessage=message.slice(1);
            if(message[0]=='S') 
               newSceneArrivedCallback(slicedMessage);
            else if(message[0]=='C')
               consoleTextArrivedCallback(slicedMessage);      
            else if(message[0]=='E') //console error
               consoleTextArrivedCallback(slicedMessage);      
            else 
              console.log("websocket callback onmessage got invalid message "+message);
         }
            
      }.bind(this);
      
      this.websocket.onerror = function(evt)
      {
         console.warn("Websocket error:", evt.data);
      };
   }
   catch(exception)
   {
      alert("Websocket fatal error, maybe your browser can't use websockets. You can look at the javascript console for more details on the error.");
      console.error("Websocket fatal error", exception);
   }
}

Network.prototype.connected = function()
{
   if (this.websocket && this.websocket.readyState == 1)
   {
      return true;
   }
   return false;
};

Network.prototype.reconnect = function()
{
   if (this.connected())
   {
      this.disconnect();
   }
   this.connect();
}

Network.prototype.disconnect = function()
{
   this.disconnectionAsked = true;
   if (this.connected())
   {
      this.websocket.close();
      updateSocketState(this.websocket);
   }
}

Network.prototype.send = function(message)
{
   if (this.connected())
   {
      this.websocket.send(message);
   }
};

Network.prototype.checkSocket = function()
{
   if (this.websocket)
   {
      var stateStr;
      switch (this.websocket.readyState)
      {
      case 0:
         stateStr = "CONNECTING";
         break;
      case 1:
         stateStr = "OPEN";
         break;
      case 2:
         stateStr = "CLOSING";
         break;
      case 3:
         stateStr = "CLOSED";
         break;
      default:
         stateStr = "UNKNOW";
         break;
      }
      //$("#socketState").text(" (" + stateStr + ")"); 
      console.log("Websocket state : " + this.websocket.readyState + " (" + stateStr + ")");
   }
   else
   {
      console.log("Websocket is not initialised");
   }
}

function net_sendMessage(value)
{

   if (network && network.connected())
   {
      network.send(value);
      console.log("Message sent :", '"'+value+'"');
   }
   else
   console.log("Not connected to remote, so no message sent");
}

function net_isConnected()
{
   return network && network.connected()
}

//note: this doesn't actually pause the code... you need to provide callbacks for things to change on
//connection success / failure
function net_waitForConnection(msecs,callback,failcallback) {
   if(network == null || network.websocket == null || msecs < 0) {
      if(failcallback != null) {
         failcallback();
      }
      return;
   }
   net_updateSocketState(network.websocket);
    if (network.websocket.readyState === 1) {
        if(callback != null){
            callback();
        }
        return;
    }

    setTimeout(
        function () {
            console.log("wait for connection...");
            net_updateSocketState(network.websocket);
            net_waitForConnection(msecs-50, callback, failcallback);
        }, 50); // wait 50 miliseconds for the connection...
}

function net_waitForDisconnection(msecs,callback,failcallback) {
   if(network == null || network.websocket == null || msecs < 0) {
      if(callback != null) {
         callback();
      }
      return;
   }
   net_updateSocketState(network.websocket);
    if (network.websocket.readyState == 3) {
        if(callback != null){
            callback();
        }
        return;
    }

    setTimeout(
        function () {
            console.log("wait for disconnection...");
            net_updateSocketState(network.websocket);
            net_waitForDisconnection(msecs-50, callback, failcallback);
        }, 50); // wait 50 milisecond for the connection...
}


function net_updateSocketState(websocket)
{
   console.log("in updateSocketState");      

   if (websocket != null)
   {
      var stateStr;
      switch (websocket.readyState)
      {
      case 0:
         stateStr = "CONNECTING";
         break;
      case 1:
         stateStr = "OPEN";
         break;
      case 2:
         stateStr = "CLOSING";
         break;
      case 3:
         stateStr = "CLOSED";
         break;
      default:
         stateStr = "UNKNOW";
         break;
      }
      //$("#socketState").text(" (" + stateStr + ")"); 
      
      console.log("  socket state changed: " + websocket.readyState + " (" + stateStr + ")");
   }
   else
   {
      console.log("  websocket is null. closed");     
      //document.querySelector("#socketState").innerText = "3 (CLOSED)";
   }
}






//the server address in the form ws://[IP]:[PORT]
var serverAddr = "ws://localhost:1234";
//the DOM element containing the scene
var sceneArea;
//the DOM element containing the text output.  Can be null.
var textArea;


var scene = new THREE.Scene();
//var camera = new THREE.PerspectiveCamera( 75, 1.0, 0.1, 1000 );
var camera = new THREE.PerspectiveCamera( 45, 1.0, 0.1, 1000 );
var sceneCache = {};
camera.position.z = 6;
camera.position.y = 3;

var renderer = new THREE.WebGLRenderer();  
var loader = new THREE.ObjectLoader();
var controls;

var network; 
var freeRun=false;
//the function to run when an advance step is complete
var refreshCallback; 

function kclient_init(dom_sceneArea,dom_textArea)
{
	sceneArea = dom_sceneArea;
	textArea = dom_textArea;
	//renderer.setClearColor(0x88888888);
  renderer.setClearColor(0x888888FF);
	dom_sceneArea.appendChild( renderer.domElement );  //attach the three.js renderer to the proper div 

	controls=new THREE.TrackballControls( camera, sceneArea);
	    controls.rotateSpeed = 1.0;
	    controls.zoomSpeed = 1.2;
	    controls.panSpeed = 0.8;
	    controls.noZoom = false;
	    controls.noPan = false;
	    controls.staticMoving = true;
	    controls.dynamicDampingFactor = 0.3;
	    controls.keys = [ 65, 83, 68 ];
	controls.addEventListener( 'change', kclient_render );   

  kclient_windowResize(sceneArea.offsetWidth,sceneArea.offsetHeight);

  var axisHelper = new THREE.AxisHelper( 0.2 );
  scene.add( axisHelper );
  animate();
}

function kclient_connect(addr,boilerid,onconnect,onfailure)
{
	if(net_isConnected()) {
		kclient_disconnect(function() { kclient_connect(addr,boilerid,onconnect,onfailure); });
		return;
	}
	serverAddr = addr;
	if(!net_isConnected())
	{
		_doConnect();
	}
	if(boilerid!=null || onconnect || onfailure) {
		net_waitForConnection(1000,function() {
			net_sendMessage("B"+boilerid);
			if(onconnect) { onconnect(); }
		},onfailure);
	}
}
              
function kclient_setCode(code,callback)
{
	if(!net_isConnected()) {
		console.log("Error, kclient_setCode called before kclient_connect (or connect failed)...");
		return;
	}
	
	_sendCode(code); 
	refreshCallback = callback;
	freeRun = false;
	//kclient_advance();
}


function kclient_isConnected()
{
	return net_isConnected();
}

function kclient_disconnect(ondisconnect)
{
	if(network) {
	   network.disconnect();
	}
	freeRun = false;
	if(ondisconnect) {
		net_waitForDisconnection(5000,ondisconnect);
	}
}

function kclient_advance(callback)
{
	refreshCallback = callback;
	if(net_isConnected()) {
		net_sendMessage("A");
	}
	freeRun = false;
}

function _freeRunCallback() {
	if(freeRun) { 
		net_sendMessage("R");
	}
}

function kclient_animate(animate)
{
	if(freeRun == animate) return;
	if(!animate) {
		console.log("stopping freeRun...");
		freeRun=false;
	}
	else {
      if(!net_isConnected()) {
         console.log("not connected, can't start freeRun");
      }
      else {
		  console.log("starting freeRun...");
        refreshCallback = _freeRunCallback;
        freeRun=true;
        net_sendMessage("R");
     }
	}
}
//TODO: request interrupt of embedded python
// http://stackoverflow.com/questions/1420957/stopping-embedded-python

function _runConnected(onconnect)
{
	if(!net_isConnected())
	{
		_doConnect();
	}
	net_waitForConnection(1000,onconnect,null);
}

function _doConnectInternal()
{
	console.log("trying to connect to URL: " + serverAddr);
	network = new Network(serverAddr,newSceneArrivedCallback,consoleTextArrivedCallback,consoleTextArrivedCallback);    
}

function _doConnect()
{
	if(net_isConnected()) {
	   net_waitForDisconnection(5000,function() {_doConnectInternal();});
	}
	else 
	   _doConnectInternal();
}

function _sendCode(code) //send python code back to server
{
	console.log("got request to send code!\n");
	net_sendMessage("C"+code);
	//net_sendMessage("hello world");
}

function kclient_windowResize( w,h )
{
	console.log("onWindowResize width: " + w + " height: " + h);

	mWidth= w; //account for 5px padding on each side
	mHeight=h;

	renderer.setSize(mWidth,mHeight);
	camera.aspect =mWidth/ mHeight;

	camera.updateProjectionMatrix();  
	controls.handleResize();
	kclient_render();
}       

function consoleTextArrivedCallback(data)
{
	//console.log("new console text has arrived: " + data);
	if (textArea == null) {
		return;
	}

	//TODO: add it to text window here. 

	var n = data.indexOf("\n");
	if(n!=-1)
	{
	   data = data.slice(0, n+1) + "> " + data.slice(n+1);         
	   
	}
	textArea.value+=data;
	//var currentText=textArea.val();

	//textArea.val(currentText+data);
	textArea.scrollTop = textArea.scrollHeight;
}

function consoleErrorArrivedCallback(data)
{    
	console.log("new console error has arrived: " + data);
	if (textArea == null) {
		return;
	} 

	//TODO: add it to text window here. 
	textArea.value+=data;
	//var currentText=textArea.val();

	//textArea.val(currentText+data);
	textArea.scrollTop = textArea.scrollHeight;
}

function getObject(name) 
{
	var object = sceneCache[name];
	if(object == null) {
		object = scene.getObjectByName(name, true );
		if(object != null) {
			sceneCache[name] = object;
		}
		return object;
	}
	return object;
}

//dataJ has a Three.js scene object format
function kclient_set_scene(dataJ)
{
	//loader.setTexturePath( scope.texturePath );

	var scope = this;

     scene.traverse( function ( child ) { //make sure to dispose all old objects
	      if ( child.geometry !== undefined ) child.geometry.dispose();
       if ( child.material !== undefined ) child.material.dispose();
   } );
   scene=null;
   sceneCache={};

   scene = loader.parse( dataJ );
}

///sceneObjects is a list of dictionaries, each containing the members "name" and "matrix"
function kclient_set_transforms(sceneObjects)
{
   for(i=0; i<sceneObjects.length; i++)
   {  
      //console.log("Update requested to: " + sceneObjects[i].name);
      //console.log("  new matrix is: " + sceneObjects[i].matrix);

      var object = getObject(sceneObjects[i].name);
      if(object != null)
      { 
        //console.log("  we found \"" + sceneObjects[i].name + "\" in the Three.js scene");
                       
        object.matrixAutoUpdate=false;
        object.matrixWorldNeedsUpdate=true;
      
        var m=sceneObjects[i].matrix;
   
        object.matrix.set(m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14],m[3],m[7],m[11],m[15]);
      } 
   } 
}

function kclient_rpc(request)
{
   if(request.type == "set_color") 
   {
      var object_name=request.object;
      var rgba=request.rgba;
      var recursive=request.recursive;
                                                 
      console.log("set_color requested. object: " + object_name + " rgba: " + rgba); 
      
      var object = getObject(object_name)
      if(object == null) {
      	console.log("Invalid object name "+object_name+" specified in set_color");
      }
      else { 
         //if(typeof object.material !== 'undefined')
         //{
          //  console.log("first checking if we've working this this material before");
                                                            
            if (recursive == true)
            {
               if(typeof object.userData.customSharedMaterialSetup === 'undefined')
               {                          
                  if(object.type == 'Line')
                  {
                     basicMaterial = new THREE.LineBasicMaterial();                         
                  }
                  else
                     basicMaterial = new THREE.MeshPhongMaterial();
                  
                  object.material=basicMaterial;      
                  
                  object.userData.customSharedMaterialSetup=true;
                  
                  object.traverse( function ( child ) { 
                  if (typeof child.material !== 'undefined') 
                     child.material=object.material;
                  } );
               }                        
            }
            else
            {
               if(typeof object.userData.customSingleMaterialSetup === 'undefined')
               { 
                  if(object.type == 'Line')
                  {
                  	console.log("Setting line material "+rgba);
                     basicMaterial = new THREE.LineBasicMaterial();                         
                  }
                  else
                     basicMaterial = new THREE.MeshPhongMaterial();
                  
                  object.material=basicMaterial;      
                  
                  object.userData.customSingleMaterialSetup=true;
               }
            }
            
      
            object.material.color.setRGB(rgba[0],rgba[1],rgba[2]);
            if(rgba[3]!=1.0)
            {
               object.material.transparent=true;
               object.material.opacity=rgba[3];
            }
            else
            {
               object.material.transparent=false;
            }
         //}
         //else
         //{
         //   console.log("ERROR: no material associated with object: " + object_name);  
         //   alert("ERROR: kviz.set_color is trying to set an object with no material");
         //}
      }
   }
   else if(request.type == "set_visible") 
   {
      var object_name=request.name;
      var visible=request.value;
                                                 
      console.log("set_visible requested. object: " + object_name + " visible: " + visible); 
      
      var object = getObject(object_name);
      if(object == null) {
      	console.log("Invalid object name "+object_name+" specified in set_visible");
      }
      else {
      	object.visible = visible;
      }
   }
   else if(request.type == "add_ghost") 
   {
      var object_name=request.object;
      var prefix=request.prefix_name;
                                                 
      console.log("add_ghost requested. object: " + object_name + " prefix: " + prefix); 
                                   
      var object = getObject(object_name);
      if(object != null)
      { 
         console.log("we found the object in the tree");
        
         var clone_object=object.clone(true);
         scene.add(clone_object);
         
         clone_object.traverse( function ( child ) { 
                  if (typeof child.name !== 'undefined') 
                     child.name=prefix+child.name;
                  } );
      }
   }
   else if(request.type == "set_position")
   {                 
      console.log("got a set_position RPC request for: " + request.object);
      var object = getObject(request.object);
      if(object != null)
      {            
        object.matrixAutoUpdate=false;
        object.matrixWorldNeedsUpdate=true;
      
        var m=request.matrix;     
        object.matrix.set(m[0],m[1],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],m[11],m[12],m[13],m[14],m[15]);
      } 
      else
         console.log("  couldn't find object: " + request.object);
   }
   else if(request.type == "add_text")
   {
      console.log("RPC to add text!");     
      var text2 = document.createElement('div');
      text2.style.position = 'absolute';
      text2.id="_text_overlay_"+request.name;
      //text2.style.zIndex = 1;    // if you still don't see the label, try uncommenting this
      //text2.style.width = 100;
      //text2.style.height = 100;
      //text2.style.backgroundColor = "blue";
      if(request.text!=null)
         text2.innerHTML = request.text;
         
      text2.style.top = request.x + '%';
      text2.style.left = request.y + '%';
      sceneArea.appendChild(text2);
   }
   else if(request.type == "update_text")
   {
      var text2 = document.getElementById("_text_overlay_"+request.name);
      text2.innerHTML = request.text;
   }
   else if(request.type == "add_sphere")
   {
      console.log("RPC to add sphere!"); 
      var geometry = new THREE.SphereGeometry(1.0,20,20);
      var material = new THREE.MeshPhongMaterial( {color: 0xAA0000} );
      var sphere = new THREE.Mesh( geometry, material );
      
      sphere.scale.x=request.r;
      sphere.scale.y=request.r;
      sphere.scale.z=request.r;
      
      sphere.name=request.name;
      sphere.position.set(request.x,request.y,request.z);
      scene.add( sphere );                     
   }
   else if(request.type == "update_sphere")
   {                 
      var sphere = getObject(request.name);
      if(sphere != null)
      { 
         sphere.position.set(request.x,request.y,request.z);
         if(request.r!=-1)
         {
            sphere.scale.x=request.r;
            sphere.scale.y=request.r;
            sphere.scale.z=request.r;
         }
      }
      else
         console.log("couldn't find sphere named: " + request.name);
   }
   else if(request.type == "add_line")
   {
      var geometry = new THREE.Geometry();
      
      geometry.vertices.push(new THREE.Vector3(request.x1,request.y1,request.z1));
      geometry.vertices.push(new THREE.Vector3(request.x2,request.y2,request.z2));
      geometry.dynamic  = true;
         
      var material = new THREE.LineBasicMaterial( {color: 0xAA0000} );
      var line = new THREE.Line( geometry, material );
      line.name=request.name;
       
      scene.add( line );                     
   }
   else if(request.type == "update_line")
   {  
      var line = getObject(request.name);
      if(line != null)
      { 
         line.geometry.vertices[0]=new THREE.Vector3(request.x1,request.y1,request.z1);
         line.geometry.vertices[1]=new THREE.Vector3(request.x2,request.y2,request.z2);
         line.geometry.verticesNeedUpdate = true;
      }
      else
         console.log("couldn't find line named: " + request.name);
   } 
   else {
      console.log("Invalid request: "+request.type);
   }
}

function newSceneArrivedCallback(data)
{   
	console.log("new scene has arrived!");

	var dataJ=JSON.parse(data); 

	//need to determine if full scene or just transforms
	var isFullScene=dataJ.metadata.fullscene;

	console.log("full scene is: " + isFullScene);

	if(isFullScene)
	{        
	   var t0 = performance.now();

	   kclient_set_scene(dataJ);

	   //TODO: make this optional?
	   var axisHelper = new THREE.AxisHelper( 0.2 );
	   scene.add( axisHelper );

	   //clear anything named _text_overlay_X
	   var overlayList = [];
	   for(var i=0;i<sceneArea.children.length; i++) {
			if(sceneArea.children[i].id.startsWith("_text_overlay_")) {
				overlayList.push(sceneArea.children[i]);
				console.log("Removing text item "+sceneArea.children[i].id);
			}
		}
		for (i=0;i<overlayList.length;i++) {
	     	sceneArea.removeChild(overlayList[i]);
		}
	   var t1 = performance.now();
	   console.log("Call to load scene " + (t1 - t0) + " milliseconds.")
	   //scene.traverse ( function (child) {
	   //  console.log("found: " + child.name);
	   //});
	}
	else //just apply transforms
	{
	   var t0 = performance.now();
	   kclient_set_transforms(dataJ.object);
	   var t1 = performance.now();
	   console.log("Call to load tranforms " + (t1 - t0) + " milliseconds.");
	}

	var t1 = performance.now();

	var rpc =dataJ.RPC;
	for(i=0; i<rpc.length; i++)
	{  
		kclient_rpc(rpc[i]);
	}
	var t2 = performance.now();
	if(rpc.length > 0)
	{
	   console.log("Call to do RPC's " + (t2 - t1) + " milliseconds.")
	}
	else
	   console.log("no RPC's present");

	data=null;
	dataJ=null;
	rpc=null;

	var t0 = performance.now();
	kclient_render();
	var t1 = performance.now();
	console.log("Time to render " + (t1 - t0) + " milliseconds.")
	console.log("finished processing message");

	if(refreshCallback) refreshCallback();
}

function kclient_render()
{     
	renderer.render( scene, camera );
}

function animate()
{
        requestAnimationFrame( animate  );
        controls.update();
}


return {
   init:kclient_init,
   windowResize:kclient_windowResize,
   connect:kclient_connect,
   setCode:kclient_setCode,
   isConnected:kclient_isConnected,
   disconnect:kclient_disconnect,
   advance:kclient_advance,
   animate:kclient_animate,
   set_scene:kclient_set_scene,
   set_transforms:kclient_set_transforms,
   rpc:kclient_rpc,
   render:kclient_render,
   }
})();

if (window.klamptAsyncInit) {
  window.klamptAsyncInit();
}