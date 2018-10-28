
// Settable fields
var WEB_URL = "http://mpassets.highfidelity.com/ff287849-5c74-4c89-9108-e7af7b244e06-v1/scanner-ui.html"






/*********************************
 **          Polyfills          **
 *********************************/

/** function.bind() polyfill */
if (!Function.prototype.bind) {
  Function.prototype.bind = function(oThis) {
    if (typeof this !== 'function') {
      // closest thing possible to the ECMAScript 5
      // internal IsCallable function
      throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
    }

    var aArgs   = Array.prototype.slice.call(arguments, 1),
        fToBind = this,
        fNOP    = function() {},
        fBound  = function() {
          return fToBind.apply(this instanceof fNOP
                 ? this
                 : oThis,
                 aArgs.concat(Array.prototype.slice.call(arguments)));
        };

    if (this.prototype) {
      // Function.prototype doesn't have a prototype property
      fNOP.prototype = this.prototype;
    }
    fBound.prototype = new fNOP();

    return fBound;
  };
}
















/*************************************************
 **                  Gun class                  **
 *************************************************/


/**
 *  This class manages the scanner gun client-side.
 */
function Gun() {

    // Our properties
    this.id = null
    this.desktopDisplay = null

    // Bind listener functions
    this.onMousePress = this.onMousePress.bind(this)

}

/**
 *  Utility function to get the child entity with a specific name
 */
Gun.prototype.getChildWithName = function(name) {

    // Get all children
    var childrenIDs = Entities.getChildrenIDs(this.id)

    // Check each child
    for (var i = 0 ; i < childrenIDs.length ; i++) {

        // Get entity name
        var entityInfo = Entities.getEntityProperties(childrenIDs[i], ["name"])
        if (entityInfo.name == name)
            return childrenIDs[i]

    }

    // None found
    return null

}

/**
 *  Called by HF when the gun is loaded.
 */
Gun.prototype.preload = function(id) {
    print("[Scanner] Loaded")

    // Store our ID
    this.id = id

}

/**
 *  Called by HF when the gun is unloaded.
 */
Gun.prototype.unload = function() {
    print("[Scanner] Unloaded")

    // Remove desktop display, if any
    if (this.desktopDisplay) {
        this.desktopDisplay.close()
        this.desktopDisplay = null
    }

    // Remove listeners. Ignore errors if already disconnected.
    try { Entities.mousePressOnEntity.disconnect(this.onMousePress) } catch (e) {}

}

/**
 *  Called by HF when the current user equips the gun.
 */
Gun.prototype.startEquip = function(entityID, args) {
    print("[Scanner] Equipped")

    // Store equipped hand
    this.equippedHand = args[0]

    // Continue only on desktop
    if (HMD.active)
        return

    // Create the scanner window if needed
    if (!this.desktopDisplay) {

        // Create desktop display
        print("[Scanner] Created web overlay")
        this.desktopDisplay = new OverlayWebWindow()
        this.desktopDisplay.setPosition(Desktop.width - 500, Desktop.height - 460)
        this.desktopDisplay.setSize(420, 300)
        this.desktopDisplay.setTitle("Scanner")

    }

    // Get web entity's current URL
    var webEntity = this.getChildWithName("Scanner Gun - Display")
    var currentURL = Entities.getEntityProperties(webEntity, ["sourceUrl"]).sourceUrl || ""

    // Set the scanner display visible, and set the URL
    this.desktopDisplay.setVisible(true)
    this.desktopDisplay.setURL(currentURL)

    // Add listener for the click on entity event
    Entities.mousePressOnEntity.connect(this.onMousePress)

}

/**
 *  Called continually while the entity is equipped. We can use this to read the status of the VR trigger and buttons, etc.
 */
Gun.prototype.continueEquip = function() {

    // Get controls we are listening for. This depends on which hand is holding the gun.
    var controllerBtn = this.equippedHand == "left" ? Controller.Standard.LT : Controller.Standard.RT

    // Check position of trigger
    var triggerValue = Controller.getValue(controllerBtn);
    if (this.triggerIsDown && triggerValue < 0.85) {

        // Trigger released
        this.triggerIsDown = false

    } else if (!this.triggerIsDown && triggerValue > 0.85) {

        // Trigger pressed
        this.triggerIsDown = true

        // Get orientation details about our gun entity
        var props = Entities.getEntityProperties(this.id, ["position", "rotation"])

        // Run a raytrace to see what the user was aiming at
        var intersection = Entities.findRayIntersection({ origin: props.position, direction: Vec3.multiply(Quat.getFront(props.rotation), -1) }, true, [], [this.id], true)
        this.identify(intersection.entityID)

    }

}

/**
 *  Called by HF when the current user unequips (drops) the gun.
 */
Gun.prototype.releaseEquip = function() {
    print("[Scanner] Unequipped")

    // Hide desktop display
    if (this.desktopDisplay)
        this.desktopDisplay.setVisible(false)

    // Remove listeners. Ignore errors if already disconnected.
    try { Entities.mousePressOnEntity.disconnect(this.onMousePress) } catch (e) {}

}

/**
 *  Called by HF (bound event) when the user clicks on ANY entity. NOTE: This is only bound during desktop equip, so we can
 *  assume the gun is equipped *in desktop mode* when this event comes through.
 */
Gun.prototype.onMousePress = function(entityID, event) {

    // Check that it was the left mouse button
    if (!event.isPrimaryButton)
        return

    // Start identifying
    this.identify(entityID)

}

/**
 *  Sets the new state for the display.
 */
Gun.prototype.setState = function(state) {

    // Create new URL
    var url = WEB_URL + "#" + encodeURIComponent(JSON.stringify(state))
    print("[Scanner] Setting display URL to " + url)

    // Set local on-screen window if it exists
    if (this.desktopDisplay)
        this.desktopDisplay.setURL(url)

    // Request a URL change from the server
    var webEntity = this.getChildWithName("Scanner Gun - Display")
    Entities.callEntityServerMethod(webEntity, "setURL", [url])

    // If we have permission, just change it ourselves
    Entities.editEntity(webEntity, { sourceUrl: url })

}

/**
 *  Starts identifying the specified entity ID
 */
Gun.prototype.identify = function(entityID) {

    // Show error if no entity
    if (!entityID || Uuid.isNull(entityID))
        return this.setState({ state: "error", error: "No signal detected." })

    // Change to Checking status
    print("[Scanner] Identifying entity " + entityID)
    this.setState({
        state: "checking"
    })

    // Wait a bit for effect, then start identifying
    if (this.identifyTimer) Script.clearTimeout(this.identifyTimer)
    this.identifyTimer = Script.setTimeout(this.identifyContinue.bind(this, entityID), 1000)

}

Gun.prototype.identifyContinue = function(entityID) {

    // Clear timer which triggers this call
    if (this.identifyTimer) Script.clearTimeout(this.identifyTimer)
    this.identifyTimer = null

    // Get entity properties
    var props = Entities.getEntityProperties(entityID, [])

    // Show error if no properties found
    if (!props || !props.type)
        return this.setState({ state: "error", error: "Entity has disappeared." })

    // Read userdata
    var userData = {}
    try {
        userData = JSON.parse(props.userData) || {}
    } catch (e) {
    }

    // Read scanner-specific data
    var scannerInfo = userData.scanner || {}

    // Get model filename, if any
    var modelName = props.modelURL || ""
    var idx = modelName.lastIndexOf("/")
    if (idx != -1) modelName = modelName.substr(idx+1)
    idx = modelName.indexOf("?")
    if (idx != -1) modelName = modelName.substr(0, idx)

    // Get entity marketplace info
    var marketplaceInfo = Entities.getStaticCertificateJSON(entityID)
    if (marketplaceInfo && typeof marketplaceInfo == 'string')
        marketplaceInfo = JSON.parse(marketplaceInfo)

    // Display standard entity info
    this.setState({
        state: "entity",
        type: props.type,
        id: entityID,
        name: props.name || props.itemName || modelName,
        owner: props.clientOnly ? props.owningAvatarID : null,
        age: parseFloat(props.age) * 1000,
        lifetime: parseFloat(props.lifetime) * 1000,
        locked: props.locked,
        href: props.href,
        description: props.description || props.itemDescription,
        icon: scannerInfo.icon,
        hasScript: !!(props.script || props.serverScripts),
        cloneable: props.cloneable,
        dynamic: props.dynamic,
        collisionless: props.collisionless,
        grabbable: !userData.grabbableKey || userData.grabbableKey.grabbable,
        wearable: !!userData.wearable,
        renderInfo: {
            vertices: props.renderInfo.verticesCount,
            textureSize: props.renderInfo.textureSize,
            hasTransparent: props.renderInfo.hasTransparent,
            drawCalls: props.renderInfo.drawCalls
        },
        marketItem: marketplaceInfo
    })

}




// Use the Gun class to manage the attached entity
;(Gun)
