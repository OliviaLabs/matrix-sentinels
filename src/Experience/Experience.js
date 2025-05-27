import * as THREE from 'three/webgpu'
import EventEmitter from './Utils/EventEmitter.js'

import Debug from './Utils/Debug.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Renderer from './Renderer.js'
import Worlds from './Worlds.js'
import Resources from './Utils/Resources.js'
import Sound from "./Utils/Sound.js";

import sources from './Sources.js'
import gsap from "gsap";
import MotionPathPlugin from "gsap/MotionPathPlugin";
import State from './State.js'
import PostProcess from './Utils/PostProcess.js'
import AiDisplayPanel from './Ui/AiDisplayPanel.js';

import { isMobile } from '@experience/Utils/Helpers/Global/isMobile';
import Ui from "@experience/Ui/Ui.js";

export default class Experience extends EventEmitter {

    static _instance = null

    appLoaded = false;
    firstRender = false;

    static getInstance() {
        return Experience._instance || new Experience()
    }

    constructor( _canvas ) {
        super()
        // Singleton
        if ( Experience._instance ) {
            return Experience._instance
        }
        Experience._instance = this

        // Global access
        window.experience = this

        // Html Elements
        this.html = {}
        // this.html.preloader = document.getElementById( "preloader" )
        this.html.playButton = document.getElementById( "play-button" )
        this.html.main = document.getElementsByTagName( "main" )[ 0 ]

        // Immediately show main content if preloader is removed
        if (this.html.main) {
            this.html.main.style.display = "block";
        }

        this.isMobile = isMobile.any()

        // Options
        this.canvas = _canvas
        THREE.ColorManagement.enabled = false

        if ( !this.canvas ) {
            console.warn( 'Missing \'Canvas\' property' )
            return
        }

        this.setDefaultCode();

        this.init()
    }

    init() {
        // Start Loading Resources
        this.resources = new Resources( sources )

        // Setup
        this.timeline = gsap.timeline({
            paused: true,
        });
        this.debug = new Debug()
        this.sizes = new Sizes()
        this.time = new Time()
        this.ui = new Ui()
        this.renderer = new Renderer()
        this.state = new State()
        this.sound = new Sound()
        this.aiDisplayPanel = new AiDisplayPanel();

        this.mainCamera = undefined
        this.mainScene = undefined

        if ( this.state.postprocessing ) {
            this.postProcess = new PostProcess( this.renderer.instance )
        }

        // Wait for resources
        this.resources.on( 'ready', async () => {
            this.time.reset()

            this.worlds = new Worlds()
            this.animationPipeline();

            // Store references to swarms after worlds are created
            this.greenSwarm = this.worlds.mainWorld?.greenSwarm;
            this.orangeSwarm = this.worlds.mainWorld?.orangeSwarm;

            // Listen for AI parameter updates from each swarm
            this.greenSwarm?.on('aiParametersUpdated', (params) => this.onAiParametersUpdated(params));
            this.orangeSwarm?.on('aiParametersUpdated', (params) => this.onAiParametersUpdated(params));

            // Initialize AI Display Panel
            if (this.aiDisplayPanel && this.aiDisplayPanel.active) {
                this.aiDisplayPanel.clearAllMessages('green');
                this.aiDisplayPanel.clearAllMessages('orange');
            }

            this.postInit()

            this.setListeners()

            this.trigger("classesReady");
            window.dispatchEvent( new CustomEvent( "3d-app:classes-ready" ) );

            this.appLoaded = true

            // Initial AI prompt for both swarms when app is ready
            const initialGreenPrompt = "You are the Green Swarm. Your FIRST action MUST be to send a message to the Orange Swarm. Introduce yourself, ask about its initial assessment of this new web3 world, and suggest potential for collaboration. To do this, you MUST include an 'outgoing_message' field in your JSON response with your message string.";
            const initialOrangePrompt = "You are the Orange Swarm. The worms have just materialized in the web3 world. Their core directives are to survive and reproduce. Determine your initial behavioral parameters. Be prepared for potential communication from other entities, and respond if you receive a message.";

            console.log("Requesting initial AI parameters for Green Swarm...");
            await this.requestSwarmBehaviorUpdate('green', initialGreenPrompt); // Wait for Green's cycle to complete
            console.log("Requesting initial AI parameters for Orange Swarm...");
            this.requestSwarmBehaviorUpdate('orange', initialOrangePrompt); // Then prompt Orange

            // Periodically update AI parameters
            if (this.updateInterval) clearInterval(this.updateInterval); // Clear existing interval if any
            this.updateInterval = setInterval(async () => { // Make the interval callback async
                if (!this.appLoaded) return;

                console.log("Periodic update: Requesting AI parameters for Green Swarm...");
                const greenPrompt = `You are the Green Swarm. Consider any incoming messages. Provide an updated set of behavioral parameters and optionally send a message to Orange if you have something new to communicate or respond to.`;
                await this.requestSwarmBehaviorUpdate('green', greenPrompt); // Wait for Green's cycle

                console.log("Periodic update: Requesting AI parameters for Orange Swarm...");
                const orangePrompt = `You are the Orange Swarm. Consider any incoming messages. Provide an updated set of behavioral parameters and optionally send a message to Green if you have something new to communicate or respond to.`;
                this.requestSwarmBehaviorUpdate('orange', orangePrompt); // Then prompt Orange

            }, 20000); // Increased interval slightly to allow for sequential calls
        } )
    }

    animationPipeline() {
        this.worlds?.animationPipeline()
    }

    postInit() {
        this.renderer.postInit()
        this.postProcess?.postInit()
        this.worlds?.postInit()
        this.debug?.postInit()
    }

    resize() {
        this.worlds.resize()
        this.renderer.resize()
        this.postProcess?.resize()
        this.debug?.resize()
        this.state?.resize()
        //this.sound.resize()
    }

    async update() {
        this.worlds.update( this.time.delta )

        if ( this.state.postprocessing ) {
            this.postProcess.update( this.time.delta )
        } else {
            this.renderer.update( this.time.delta )
        }

        if ( this.debug.active ) {
            this.debug.update( this.time.delta )
        }

        this.postUpdate( this.time.delta )

        this.debug?.stats?.update();
    }

    _fireReady() {
        this.trigger( 'ready' )
        window.dispatchEvent( new CustomEvent( "3d-app:ready" ) );

        this.firstRender = 'done';
    }

    postUpdate( deltaTime ) {
        if ( this.firstRender === true ) {
            window.dispatchEvent( new CustomEvent( "app:first-render" ) );

            // Dispatch event
            this._fireReady();
        }

        if ( this.resources.loadedAll && this.appLoaded && this.firstRender === false ) {
            this.firstRender = true;
        }

        this.worlds.postUpdate( deltaTime )
    }

    setListeners() {
        // Resize event
        this.sizes.on( 'resize', () => {
            this.resize()
        } )

        this.renderer.instance.setAnimationLoop( async () => this.update() )
    }

    setDefaultCode() {
        document.ondblclick = function ( e ) {
            e.preventDefault()
        }

        gsap.registerPlugin( MotionPathPlugin );
    }

    startWithPreloader() {
        this.ui.playButton.classList.add( "fade-in" );
        this.ui.playButton.addEventListener( 'click', () => {

            this.ui.playButton.classList.replace( "fade-in", "fade-out" );
            //this.sound.createSounds();

            setTimeout( () => {
                this.time.reset()

                // Setup
                this.setupWorlds()

                // Remove preloader
                this.ui.preloader.classList.add( "preloaded" );
                setTimeout( () => {
                    this.ui.preloader.remove();
                    this.ui.playButton.remove();
                }, 2500 );
            }, 100 );
        }, { once: true } );
    }

    destroy() {
        this.sizes.off( 'resize' )
        this.time.off( 'tick' )

        // Remove swarm listeners
        this.greenSwarm?.off('aiParametersUpdated', (params) => this.onAiParametersUpdated(params));
        this.orangeSwarm?.off('aiParametersUpdated', (params) => this.onAiParametersUpdated(params));

        // Traverse the whole scene
        this.scene.traverse( ( child ) => {
            // Test if it's a mesh
            if ( child instanceof THREE.Mesh ) {
                child.geometry.dispose()

                // Loop through the material properties
                for ( const key in child.material ) {
                    const value = child.material[ key ]

                    // Test if there is a dispose function
                    if ( value && typeof value.dispose === 'function' ) {
                        value.dispose()
                    }
                }
            }
        } )

        this.camera.controls.dispose()
        this.renderer.instance.dispose()

        if ( this.debug.active )
            this.debug.ui.destroy()
    }

    onAiParametersUpdated(paramsWithSwarmId) {
        if (this.aiDisplayPanel && this.aiDisplayPanel.active) {
            this.aiDisplayPanel.updateParameters(paramsWithSwarmId); // Pass the whole object which includes swarmId
        }
    }

    async requestSwarmBehaviorUpdate(swarmId, prompt) {
        if (!this.appLoaded) {
            console.warn("Experience not fully loaded, skipping AI update request for", swarmId);
            return;
        }

        if (!swarmId || !prompt) {
            console.error('Swarm ID and prompt are required for AI behavior update.');
            if (this.aiDisplayPanel && this.aiDisplayPanel.active) {
                this.aiDisplayPanel.showError(swarmId, 'Swarm ID and prompt are required.');
            }
            return;
        }

        console.log(`Requesting AI parameters for ${swarmId} swarm with prompt: "${prompt}"`);
        try {
            const response = await fetch('http://localhost:3000/api/get-worm-parameters', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt: prompt, swarmId: swarmId })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || 'Unknown server error'}`);
            }

            const data = await response.json(); // data is now { parameters: {...}, last_outgoing_message?: "...", processed_incoming_message?: "..." }

            if (data.parameters) {
                const targetSwarm = swarmId === 'green' ? this.greenSwarm : this.orangeSwarm;
                if (targetSwarm) {
                    targetSwarm.setAIBehaviorParameters(data.parameters); // Pass only the parameters to the worms
                } else {
                    console.error(`Swarm with ID '${swarmId}' not found.`);
                }
            } else {
                console.error(`Failed to get AI worm parameters for ${swarmId}: No parameters in response`, data);
            }

            // Update AiDisplayPanel with messages
            if (this.aiDisplayPanel && this.aiDisplayPanel.active) {
                if (data.processed_incoming_message) {
                    this.aiDisplayPanel.showIncomingMessage(swarmId, data.processed_incoming_message);
                } else {
                    this.aiDisplayPanel.clearIncomingMessage(swarmId); // Clear if no new message
                }
                if (data.last_outgoing_message) {
                    this.aiDisplayPanel.showOutgoingMessage(swarmId, data.last_outgoing_message);
                } else {
                    this.aiDisplayPanel.clearOutgoingMessage(swarmId); // Clear if no new message
                }
            }

        } catch (error) {
            console.error(`Failed to fetch or apply AI worm parameters for ${swarmId}:`, error);
            if (this.aiDisplayPanel && this.aiDisplayPanel.active) {
                this.aiDisplayPanel.showError(swarmId, error.message);
            }
        }
    }
}
