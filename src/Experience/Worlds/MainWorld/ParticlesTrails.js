import * as THREE from 'three/webgpu'
import Model from '@experience/Worlds/Abstracts/Model.js'
import Experience from '@experience/Experience.js'
import Debug from '@experience/Utils/Debug.js'
import State from "@experience/State.js";

import {
    positionLocal, time, vec3, vec4, uniform, color, If, instanceIndex,
    uint, Fn, float, smoothstep, instancedArray, deltaTime, hash
} from 'three/tsl'

import { simplexNoise4d } from "@experience/TSL/simplexNoise4d.js"

export default class ParticlesTrails extends Model {
    experience = Experience.getInstance()
    debug = Debug.getInstance()
    state = State.getInstance()
    sizes = experience.sizes
    input = experience.input


    time = experience.time

    renderer = experience.renderer.instance
    resources = experience.resources
    container = new THREE.Group();

    isMobile = this.experience.isMobile

    // tails_count = 5 //  n-1 point tails // Will be set by config
    // particles_count = this.tails_count * 100 // need % tails_count // Will be set by config
    story_count = 2 // story for 1 position
    // story_snake = this.tails_count * this.story_count // Will be set by config
    // full_story_length = ( this.particles_count / this.tails_count ) * this.story_snake // Will be set by config

    initialCompute = false

    // Default uniforms, can be overridden by config
    defaultUniforms = {
        color: uniform( new THREE.Color(1.0, 0.39, 0.0) ), // Default orange
        size: uniform( 0.489 ),
        uFlowFieldInfluence: uniform( 0.5 ),
        uFlowFieldStrength: uniform( 3.043 ),
        uFlowFieldFrequency: uniform( 0.207 ),
        uNeighborRadius: uniform( 1.5 ),
        uSeparationDistance: uniform( 0.5 ),
        uCohesionFactor: uniform( 0.02 ),
        uAlignmentFactor: uniform( 0.05 ),
        uSeparationFactor: uniform( 0.5 ),
    }
    uniforms = {} // Will be populated based on defaults and config

    varyings = {}

    constructor( config = {} ) { // Expect a config object
        super()

        this.swarmId = config.swarmId || 'defaultSwarm'; // Store swarmId
        this.config = config;

        // Initialize uniforms: start with defaults, then override with config.initialUniforms
        this.uniforms = { ...this.defaultUniforms }; // Shallow copy defaults
        if (config.initialUniforms) {
            for (const key in config.initialUniforms) {
                if (this.uniforms[key] !== undefined) {
                    if (key === 'color' && config.initialUniforms.color instanceof THREE.Color) {
                         this.uniforms.color = uniform(config.initialUniforms.color.clone());
                    } else {
                         this.uniforms[key] = uniform(config.initialUniforms[key]);
                    }
                } else {
                     // If it's a new uniform not in defaults, create it
                    if (key === 'color' && config.initialUniforms.color instanceof THREE.Color) {
                        this.uniforms.color = uniform(config.initialUniforms.color.clone());
                    } else {
                        this.uniforms[key] = uniform(config.initialUniforms[key]);
                    }
                }
            }
        }
         // Ensure 'color' uniform exists if not provided, using the config color or default
        if (!this.uniforms.color && config.color instanceof THREE.Color) {
            this.uniforms.color = uniform(config.color.clone());
        } else if (!this.uniforms.color) {
            this.uniforms.color = uniform(new THREE.Color(1.0, 0.39, 0.0)); // Fallback default
        }


        // Set counts based on config or defaults
        this.tails_count = config.tailsCount || 5;
        this.particles_per_tail = config.particlesPerTail || 100;
        this.particles_count = this.tails_count * this.particles_per_tail;

        this.story_snake = this.tails_count * this.story_count
        this.full_story_length = ( this.particles_count / this.tails_count ) * this.story_snake


        this.world = config.world
        this.camera = this.world.camera.instance
        this.cameraClass = this.world.camera
        this.scene = this.world.scene
        this.logo = this.world.logo
        this.postProcess = this.experience.postProcess

        this.setModel()
        this.setDebug()
    }

    postInit() {

    }

    setModel() {
        const positionsArray = new Float32Array( this.particles_count * 3 )
        const lifeArray = new Float32Array( this.particles_count )


        const positionInitBuffer = instancedArray( positionsArray, 'vec3' );
        const positionBuffer = instancedArray( positionsArray, 'vec3' );

        // Tails
        const positionStoryBuffer = instancedArray( new Float32Array( this.particles_count * this.tails_count * this.story_count ), 'vec3' );

        const lifeBuffer = instancedArray( lifeArray, 'float' );


        const particlesMaterial = new THREE.MeshStandardNodeMaterial( {
            metalness: 1.0,
            roughness: 0
        } );


        const computeInit = this.computeInit = Fn( () => {
            const position = positionBuffer.element( instanceIndex )
            const positionInit = positionInitBuffer.element( instanceIndex );
            const life = lifeBuffer.element( instanceIndex )

            // Position
            position.xyz = vec3(
                hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ),
                hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ),
                hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) )
            ).sub( 0.5 ).mul( vec3( 5, 5, 5 ) );

            // Copy Init
            positionInit.assign( position )

            const cycleStep = uint( float( instanceIndex ).div( this.tails_count ).floor() )

            // Life
            const lifeRandom = hash( cycleStep.add( uint( Math.random() * 0xffffff ) ) )
            life.assign( lifeRandom )


        } )().compute( this.particles_count );


        this.renderer.computeAsync( this.computeInit ).then( () => {
            this.initialCompute = true
        } )


        const computeUpdate = this.computeUpdate = Fn( () => {

            const position = positionBuffer.element( instanceIndex )
            const positionInit = positionInitBuffer.element( instanceIndex )


            const life = lifeBuffer.element( instanceIndex );

            const _time = time.mul( 0.2 )

            const uFlowFieldInfluence = this.uniforms.uFlowFieldInfluence
            const uFlowFieldStrength = this.uniforms.uFlowFieldStrength
            const uFlowFieldFrequency = this.uniforms.uFlowFieldFrequency

            // Boids Uniforms
            const uNeighborRadius = this.uniforms.uNeighborRadius;
            const uSeparationDistance = this.uniforms.uSeparationDistance;
            const uCohesionFactor = this.uniforms.uCohesionFactor;
            const uAlignmentFactor = this.uniforms.uAlignmentFactor;
            const uSeparationFactor = this.uniforms.uSeparationFactor;

            // Particle's current position and life
            const currentPosition = positionBuffer.element(instanceIndex).toVar();
            const currentLife = lifeBuffer.element(instanceIndex).toVar();

            // Life update (reset happens here if boundaries were kept)
            If(currentLife.greaterThanEqual(1.0), () => {
                currentLife.assign(currentLife.mod(1.0));
                // position.assign( positionInitBuffer.element(instanceIndex) ); // Boundary constraint removed
            }).Else(() => {
                currentLife.addAssign(deltaTime.mul(0.2));
            });

            // Flow field calculation (base movement)
            const flowFieldForce = vec3(
                simplexNoise4d(vec4(currentPosition.mul(uFlowFieldFrequency).add(0.0), _time)),
                simplexNoise4d(vec4(currentPosition.mul(uFlowFieldFrequency).add(1.0), _time)),
                simplexNoise4d(vec4(currentPosition.mul(uFlowFieldFrequency).add(2.0), _time))
            ).normalize().mul(uFlowFieldStrength).toVar();

            const cycleStep = instanceIndex.mod(uint(this.tails_count));
            const finalForce = flowFieldForce.toVar(); // Start with flow field force

            // --- REVERTED TEST ---
            /*
            If(cycleStep.equal(0), () => {
                finalForce.assign(vec3(0.0, 0.1, 0.0)); // Constant upward force
            });
            */
            // --- END REVERTED TEST ---
            
            If(cycleStep.equal(0), () => { // Head particles apply boids logic
                const separationForce = vec3(0.0).toVar();
                const alignmentForce = vec3(0.0).toVar();
                const cohesionForce = vec3(0.0).toVar();

                // Combine boids forces
                const boidTotalForce = separationForce.add(alignmentForce).add(cohesionForce);
                finalForce.addAssign(boidTotalForce); // Add boid forces to the flow field force
            });

            // Update position for head or tail
            If(cycleStep.equal(0), () => { // Head
                const newPos = currentPosition.add(finalForce.mul(deltaTime));
                positionBuffer.element(instanceIndex).assign(newPos);
            }).Else(() => { // Tail
                const prevTail = positionStoryBuffer.element(instanceIndex.mul(this.story_count));
                positionBuffer.element(instanceIndex).assign(prevTail);
            });

        } )().compute(this.particles_count);

        const computePositionStory = this.computePositionStory = Fn( () => {
            const positionStory = positionStoryBuffer.element( instanceIndex )

            const cycleStep = instanceIndex.mod( uint( this.story_snake ) )
            const lastPosition = positionBuffer.element( uint( float( instanceIndex.div( this.story_snake ) ).floor().mul( this.tails_count ) ) )

            If( cycleStep.equal( 0 ), () => { // Head
                positionStory.assign( lastPosition )
            } )

            positionStoryBuffer.element( instanceIndex.add( 1 ) ).assign( positionStoryBuffer.element( instanceIndex ) )

        } )().compute( this.full_story_length );


        particlesMaterial.positionNode = Fn( () => {
            const position = positionBuffer.element( instanceIndex );

            const cycleStep = instanceIndex.mod( uint( this.tails_count ) )
            const finalSize = this.uniforms.size.toVar()

            If( cycleStep.equal( 0 ), () => {
                finalSize.addAssign( 0.5 )
            } )

            return positionLocal.mul( finalSize ).add( position )
        } )()

        particlesMaterial.emissiveNode = this.uniforms.color

        const sphereGeometry = new THREE.SphereGeometry( 0.1, 32, 32 );

        const particlesMesh = this.particlesMesh = new THREE.InstancedMesh( sphereGeometry, particlesMaterial, this.particles_count );
        particlesMesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
        particlesMesh.frustumCulled = false;


        this.scene.add( this.particlesMesh )
        this.scene.add( this.container )


        // setInterval( async () => {
        //
        // }, 1/60 );

    }

    animationPipeline() {

    }

    resize() {

    }

    setDebug() {
        if ( !this.debug.active ) return

        //this.debug.createDebugTexture( this.resources.items.displacementTexture, this.world )


        //this.debug.createDebugNode( viewportDepthTexture( uv().flipY() ), this.world )
        //this.debug.createDebugNode( viewportLinearDepth, this.world )


        const particlesFolder = this.world.debugFolder.addFolder( {
            title: 'Particles',
            expanded: true
        } )

        // Particles
        const commonFolder = particlesFolder.addFolder( {
            title: '🖲️ Common',
            expanded: true
        } )

        commonFolder.addBinding( this.uniforms.color, 'value', {
            label: 'Color',
            color: { type: 'float' }
        })

        commonFolder.addBinding( this.uniforms.uFlowFieldInfluence, 'value', {
            min: 0, max: 1, step: 0.001, label: 'uFlowFieldInfluence'
        } )

        commonFolder.addBinding( this.uniforms.uFlowFieldStrength, 'value', {
            min: 0, max: 10, step: 0.001, label: 'uFlowFieldStrength'
        } )

        commonFolder.addBinding( this.uniforms.uFlowFieldFrequency, 'value', {
            min: 0, max: 1, step: 0.001, label: 'uFlowFieldFrequency'
        } )

        // Boids Debug
        const boidsFolder = particlesFolder.addFolder( {
            title: '🐦 Boids',
            expanded: true
        } )

        boidsFolder.addBinding( this.uniforms.uNeighborRadius, 'value', {
            min: 0, max: 10, step: 0.1, label: 'Neighbor Radius'
        } )

        boidsFolder.addBinding( this.uniforms.uSeparationDistance, 'value', {
            min: 0, max: 5, step: 0.01, label: 'Separation Distance'
        } )

        boidsFolder.addBinding( this.uniforms.uCohesionFactor, 'value', {
            min: 0, max: 1, step: 0.001, label: 'Cohesion Factor'
        } )

        boidsFolder.addBinding( this.uniforms.uAlignmentFactor, 'value', {
            min: 0, max: 1, step: 0.001, label: 'Alignment Factor'
        } )

        boidsFolder.addBinding( this.uniforms.uSeparationFactor, 'value', {
            min: 0, max: 1, step: 0.001, label: 'Separation Factor'
        } )
    }

    setAIBehaviorParameters(newParams) {
        console.log(`[${this.swarmId}] Applying AI parameters to worms:`, newParams);
        let changed = false;
        for (const key in newParams) {
            if (key === 'thought_process' || key === 'strategic_focus' || key === 'outgoing_message') { // Explicitly ignore non-uniform keys
                continue;
            }
            // Check against the class's own 'uniforms' object
            if (this.uniforms[key] !== undefined) {
                if (key === 'color' && typeof newParams[key] === 'object') {
                    // Ensure newParams[key] has r, g, b
                    if (newParams[key].hasOwnProperty('r') && newParams[key].hasOwnProperty('g') && newParams[key].hasOwnProperty('b')) {
                        if (this.uniforms.color.value.r !== newParams[key].r ||
                            this.uniforms.color.value.g !== newParams[key].g ||
                            this.uniforms.color.value.b !== newParams[key].b) {
                            this.uniforms.color.value.set(newParams[key].r, newParams[key].g, newParams[key].b);
                            // Assuming renderMaterial also needs to be updated if it exists and has uColor
                            if (this.renderMaterial && this.renderMaterial.uniforms.uColor) {
                                this.renderMaterial.uniforms.uColor.value.set(newParams[key].r, newParams[key].g, newParams[key].b);
                            }
                            changed = true;
                        }
                    } else {
                        console.warn(`Received color object for '${key}' without r, g, or b properties:`, newParams[key]);
                    }
                } else if (this.uniforms[key].value !== newParams[key]) { // For simple value types
                    this.uniforms[key].value = newParams[key];
                    // Assuming renderMaterial also needs to be updated for size if it exists and has uSize
                    if (key === 'size' && this.renderMaterial && this.renderMaterial.uniforms.uSize) {
                        this.renderMaterial.uniforms.uSize.value = newParams[key];
                    }
                    changed = true;
                }
            } else {
                console.warn(`[${this.swarmId}] AI tried to set unknown uniform: ${key}`);
            }
        }

        if (changed) {
            console.log(`[${this.swarmId}] AI parameters applied, triggering update.`);
            this.trigger('aiParametersUpdated', [{ ...newParams, swarmId: this.swarmId }]);
        } else {
            console.log(`[${this.swarmId}] AI parameters received, but no effective change to current worm uniforms.`);
            this.trigger('aiParametersUpdated', [{ ...newParams, swarmId: this.swarmId }]);
        }
    }

    async update( deltaTime ) {
        // Compute update
        if ( this.initialCompute ) {
            await this.renderer.computeAsync( this.computePositionStory )
            await this.renderer.computeAsync( this.computeUpdate )
        }
    }
}
