


/************************************************
 **                Screen class                **
 ************************************************/


/**
 *  This class manages the scanner gun's screen server-side.
 */
function Screen() {

    // Our properties
    this.id = null

    // Expose a callable function
    this.remotelyCallable = ["setURL"]

}

/**
 *  Called by HF when the screen is loaded.
 */
Screen.prototype.preload = function(id) {
    print("[Scanner] Loaded screen")

    // Store our ID
    this.id = id

}

/**
 *  Called by HF when a client entity wants to set our screen URL.
 */
Screen.prototype.setURL = function(callerID, args) {
    print("[Scanner] Setting URL")

    // Get URL
    var url = args && args[0]
    if (!url)
        return

    // Set our URL
    Entities.editEntity(this.id, { sourceUrl: url })

}


;(Screen)
