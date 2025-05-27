import * as THREE from 'three/webgpu'
import * as Helpers from '@experience/Utils/Helpers.js'
// import Stats from 'stats.js' // Not needed if inactive
// import { Pane } from 'tweakpane'; // Not needed if inactive
import Experience from "@experience/Experience.js";
import Sizes from "./Sizes.js";
// import EventEmitter from 'events'; // Remove

import {
    output, mrt
} from 'three/tsl'

export default class Debug { // No extends

    static _instance = null

    static getInstance() {
        return Debug._instance || new Debug()
    }

    experience = Experience.getInstance()
    sizes = Sizes.getInstance()

    constructor() {
        // No super()

        // Singleton
        if ( Debug._instance ) {
            return Debug._instance
        }
        Debug._instance = this

        this.active = false // Keep it definitively false and do nothing else
        this.ui = undefined // Ensure ui is undefined if not active
        this.panel = undefined // Ensure panel is undefined
        this.stats = undefined // Ensure stats is undefined

        // The entire if(this.active) block for Pane and Stats is effectively gone
    }

    postInit() {
        // Original postInit logic, ensure it doesn't assume active state
        // this.scene = experience.scene // 'experience' might be undefined here if called too early. Let's use this.experience
        if (this.experience) {
            // this.scene = this.experience.scene // This was likely for debug drawing, not essential for core app
        }
    }

    createDebugTexture( texture, world ) {
        // This method might be called elsewhere, but if !this.active, it shouldn't do much UI work.
        // For now, let it be, but if errors occur here, we might need to guard it.
        this.debugTexture = texture;
        this.world = world;
        if (world) { // Guard against world being undefined
            this.scene = world.scene;
            this.camera = world.camera.instance;
        }

        // No sprite creation if not active
        if (!this.active || !this.scene || !this.camera) return;

        const material = new THREE.SpriteNodeMaterial( {
            map: texture,
            depthTest: false,
            toneMapped: false
        } );

        const sprite = this.sprite = new THREE.Sprite( material );
        sprite.center.set( 0.0, 0.0 );
        sprite.renderOrder = 10000;

        this.scene.add(sprite);
        this._updateSprite();
    }

    _updateSprite() {
        if ( !this.active || !this.debugTexture || !this.camera || !this.sprite) return;
        const position = Helpers.projectNDCTo3D(-1, -1, this.camera, 10)
        this.sprite.position.copy( position )
    }

    resize() {
        if (this.active) this._updateSprite();
    }

    update( deltaTime ) {
        if ( this.active && this.debugTexture ) {
            this._updateSprite()
        }
    }
}
