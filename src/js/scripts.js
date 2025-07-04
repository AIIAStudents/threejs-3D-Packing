import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 
    75,
    window.innerWidth / window.innerHeight, 
    0.1,
    1000
);
camera.position.z = 30;

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

// const orbit = new OrbitControls( camera, renderer.domElement );
// orbit.update();

const geometry = new THREE.IcosahedronGeometry( 10.5, 5);
const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
const ball = new THREE.Mesh( geometry, material );
scene.add( ball );


function animate() {
    requestAnimationFrame( animate );
    ball.rotation.x += 0.01;
    ball.rotation.y += 0.01; 

    renderer.render( scene, camera );

}