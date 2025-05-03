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

    tails_count = 10 //  n-1 point tails
    particles_count = this.tails_count * 200 // need % tails_count
    story_count = 2 // story for 1 position
    story_snake = this.tails_count * this.story_count
    full_story_length = ( this.particles_count / this.tails_count ) * this.story_snake

    initialCompute = false


    uniforms = {
        color: uniform( color( 0x00ff00 )  ),
        size: uniform( 0.489 ),

        uFlowFieldInfluence: uniform( 0.5 ),
        uFlowFieldStrength: uniform( 3.043 ),
        uFlowFieldFrequency: uniform( 0.207 ),
    }

    varyings = {}

    constructor( parameters = {} ) {
        super()

        this.world = parameters.world
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


            If( life.greaterThanEqual( 1 ), () => {
                life.assign( life.mod( 1 ) )
                position.assign( positionInit )

            } ).Else( () => {
                life.addAssign( deltaTime.mul( 0.2 ) )
            } )

            // Strength
            const strength = simplexNoise4d( vec4( position.mul( 0.2 ), _time.add( 1 ) ) ).toVar()
            const influence = uFlowFieldInfluence.sub( 0.5 ).mul( -2.0 ).toVar()
            strength.assign( smoothstep( influence, 1.0, strength ) )

            // Flow field
            const flowField = vec3(
                simplexNoise4d( vec4( position.mul( uFlowFieldFrequency ).add( 0 ), _time ) ),
                simplexNoise4d( vec4( position.mul( uFlowFieldFrequency ).add( 1.0 ), _time ) ),
                simplexNoise4d( vec4( position.mul( uFlowFieldFrequency ).add( 2.0 ), _time ) )
            ).normalize()

            const cycleStep = instanceIndex.mod( uint( this.tails_count ) )

            If( cycleStep.equal( 0 ), () => { // Head
                const newPos = position.add( flowField.mul( deltaTime ).mul( uFlowFieldStrength ) /* * strength */ )
                position.assign( newPos )
            } ).Else( () => { // Tail
                const prevTail = positionStoryBuffer.element( instanceIndex.mul( this.story_count ) )
                position.assign( prevTail )
            } )


        } )().compute( this.particles_count );

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

    }

    async update( deltaTime ) {
        // Compute update
        if ( this.initialCompute ) {
            await this.renderer.computeAsync( this.computePositionStory )
            await this.renderer.computeAsync( this.computeUpdate )
        }
    }
}
