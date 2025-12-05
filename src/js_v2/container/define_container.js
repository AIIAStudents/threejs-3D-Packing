import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DEBUG = true;

function debounce(func, delay) {
	let timeoutId;
	return function (...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, delay);
	};
}

const ContainerPage = {
	state: {
		currentContainerType: "rect",
		containerConfigs: {
			rect: { widthX: 100, depthZ: 60 },
			u_shape: { outerWidthX: 120, outerDepthZ: 80, gapWidthX: 40, gapDepthZ: 50 },
			t_shape: { stemWidthX: 40, stemDepthZ: 100, crossWidthX: 120, crossDepthZ: 30, crossOffsetZ: 0 },
			common: { heightY: 50, wallThickness: 2, rotationY: 0, position: { x: 0, y: 0, z: 0 }, color: 0x1e90ff, opacity: 0.5 },
		},
		three: { scene: null, camera: null, renderer: null, controls: null, containerMesh: null },
		dom: { form: null, shapeSelect: null, shapeParamDivs: {}, inputs: {}, canvasContainer: null, nextButton: null },
	},

	init() {
        console.log("✅ [2/6] ContainerPage.init() called.");
		if (DEBUG) console.log("[Container] init/re-init triggered.");
		this.bindDOM();
		this.bindEventListeners();
		if (!this.state.three.renderer) {
			if (DEBUG) console.log("[Container] First time initialization of Three.js context.");
			this.initThreePreview();
		} else {
			if (DEBUG) console.log("[Container] Re-attaching existing Three.js renderer to new DOM.");
			if (this.state.dom.canvasContainer) {
				this.state.dom.canvasContainer.innerHTML = '';
				this.state.dom.canvasContainer.appendChild(this.state.three.renderer.domElement);
				this.onWindowResize();
			} else {
				console.error("❌ Canvas container not found on re-init!");
			}
		}
		this.setContainerType(this.state.currentContainerType);
		if (DEBUG) console.log("[Container] init/re-init complete.");
	},

	bindDOM() {
        console.log("✅ [3/6] bindDOM() called.");
		const { dom } = this.state;
		dom.form = document.getElementById("container-form");
		dom.shapeSelect = document.getElementById("container-type-select");
		dom.canvasContainer = document.getElementById("container-preview-canvas");
		dom.nextButton = document.getElementById("container-next-step-btn");
        console.log("🔍 [4/6] Querying for nextButton returned:", dom.nextButton);

		if (!dom.form) {
			console.error("❌ DOM binding failed: #container-form not found.");
			return;
		}
		dom.shapeParamDivs = {};
		const paramDivs = dom.form.querySelectorAll("[data-shape-param]");
		paramDivs.forEach(div => {
			const shape = div.getAttribute("data-shape-param");
			dom.shapeParamDivs[shape] = div;
		});
		dom.inputs = {};
		const inputs = dom.form.querySelectorAll(".container-form__input");
		inputs.forEach(input => {
			const id = input.id.replace(/-/g, "_");
			dom.inputs[id] = input;
		});
	},

	initThreePreview() {
		const { three, dom } = this.state;
		if (!dom.canvasContainer) {
			console.error("❌ Canvas container not found in initThreePreview!");
			return;
		}
		const placeholder = dom.canvasContainer.querySelector(".placeholder-text");
		if (placeholder) placeholder.remove();
		three.scene = new THREE.Scene();
		three.scene.background = new THREE.Color(0x1a1a1a);
		const { clientWidth, clientHeight } = dom.canvasContainer;
        if (clientWidth === 0 || clientHeight === 0) {
            console.warn("⚠️ Canvas container has zero dimensions. 3D preview may be invisible.");
        }
		three.camera = new THREE.PerspectiveCamera(50, clientWidth / clientHeight, 1, 1000);
		three.camera.position.set(150, 150, 150);
		three.camera.lookAt(0, 0, 0);
		three.renderer = new THREE.WebGLRenderer({ antialias: true });
		three.renderer.setSize(clientWidth, clientHeight);
		dom.canvasContainer.appendChild(three.renderer.domElement);
		three.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
		const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
		dirLight.position.set(10, 20, 5);
		three.scene.add(dirLight);
		three.controls = new OrbitControls(three.camera, three.renderer.domElement);
		three.controls.enableDamping = true;
		const animate = () => {
			requestAnimationFrame(animate);
			three.controls.update();
			three.renderer.render(three.scene, three.camera);
		};
		animate();
		if (DEBUG) console.log("[Container] Three.js preview initialized.");
	},

	bindEventListeners() {
        console.log("✅ [5/6] bindEventListeners() called.");
		const { dom } = this.state;

		if (!dom.nextButton) {
			console.error("❌ Cannot bind listener because dom.nextButton is null or undefined.");
			return;
		}

		if (dom.shapeSelect) {
				dom.shapeSelect.addEventListener("change", (e) => this.setContainerType(e.target.value));
		}

		const debouncedUpdate = debounce(() => this.updateConfigFromForm(), 150);
		Object.values(dom.inputs).forEach(input => {
				input.addEventListener("input", debouncedUpdate);
		});

        console.log(" attaching click listener to:", dom.nextButton);
		dom.nextButton.addEventListener("click", () => {
            console.log("✅ [6/6] Next button CLICKED!");
			const configToSave = {
					shape: this.state.currentContainerType,
					...this.getCurrentConfig(),
			};
			console.log("[Container] Storing config and moving to step 2 (cutting).", configToSave);

			try {
					localStorage.setItem("containerConfig", JSON.stringify(configToSave));
			} catch (e) {
					console.error("Failed to save container config to localStorage", e);
					alert("錯誤：無法儲存容器設定。");
					return;
			}

			const cutContainerTrigger = document.querySelector(
					'.sidebar-section[data-target="view-cut-container"]'
			);
			if (cutContainerTrigger) {
                console.log("Simulating click on 'cut container' sidebar trigger.");
				cutContainerTrigger.click();
			} 
			else {
                console.warn("Could not find sidebar trigger, falling back to direct navigation.");
				window.location.href = "./cut_container.html";
			}
		});
		
		window.addEventListener("resize", () => this.onWindowResize());
	},


	setContainerType(type) {
		if (DEBUG) console.log(`[Container] type changed to: ${type}`);
		this.state.currentContainerType = type;
        if(this.state.dom.shapeSelect) {
		    this.state.dom.shapeSelect.value = type;
        }
		Object.entries(this.state.dom.shapeParamDivs).forEach(([shape, div]) => {
			div.classList.toggle("hidden", shape !== "common" && shape !== type);
		});
		this.renderContainerFromState();
	},

	updateConfigFromForm() {
		const { containerConfigs, dom } = this.state;
		let hasInvalidInput = false;
		Object.values(dom.inputs).forEach(input => {
			if (!input.closest("[data-shape-param].hidden")) {
				const value = parseFloat(input.value);
				const min = parseFloat(input.min) || 0;
				if (isNaN(value) || value < min) {
					input.classList.add("invalid");
					hasInvalidInput = true;
				} else {
					input.classList.remove("invalid");
					const [shapeOrCommon, propName] = input.id.replace(/-/g, "_").split("_");
					if (propName && !propName.startsWith('position')) {
						containerConfigs[shapeOrCommon][propName] = value;
					}
				}
			}
		});
		if (!hasInvalidInput) this.renderContainerFromState();
	},

	renderContainerFromState() {
		const { three } = this.state;
		if (three.containerMesh) three.scene.remove(three.containerMesh);
		const config = this.getCurrentConfig();
		three.containerMesh = this.createContainerMesh(this.state.currentContainerType, config);
		if (three.containerMesh) {
			three.containerMesh.rotation.y = THREE.MathUtils.degToRad(config.rotationY);
			three.containerMesh.position.set(config.position.x, config.position.y, config.position.z);
			three.scene.add(three.containerMesh);
		}
	},

	createContainerMesh(type, config) {
		const material = new THREE.MeshLambertMaterial({ color: config.color, opacity: config.opacity, transparent: true, side: THREE.DoubleSide });
		let geometry;
		switch (type) {
			case "rect": geometry = new THREE.BoxGeometry(config.widthX, config.heightY, config.depthZ); break;
			case "u_shape": geometry = this.buildUShapeGeometry(config); break;
			case "t_shape": geometry = this.buildTShapeGeometry(config); break;
			default: return null;
		}
		const mesh = new THREE.Mesh(geometry, material);
		const group = new THREE.Group();
		group.add(mesh);
		const box = new THREE.Box3().setFromObject(group);
		const center = box.getCenter(new THREE.Vector3());
		group.position.sub(center);
		return group;
	},

	getCurrentConfig() {
		const { currentContainerType, containerConfigs } = this.state;
		return { ...containerConfigs.common, ...containerConfigs[currentContainerType] };
	},

	onWindowResize() {
		const { three, dom } = this.state;
		if (!three.renderer || !dom.canvasContainer) return;
		const { clientWidth, clientHeight } = dom.canvasContainer;
		three.camera.aspect = clientWidth / clientHeight;
		three.camera.updateProjectionMatrix();
		three.renderer.setSize(clientWidth, clientHeight);
	},

	buildUShapeGeometry(dim) {
		const { outerWidthX: ow, outerDepthZ: od, gapWidthX: gw, gapDepthZ: gd, heightY } = dim;
		const shape = new THREE.Shape();
		shape.moveTo(-ow / 2, -od / 2);
		shape.lineTo(ow / 2, -od / 2);
		shape.lineTo(ow / 2, od / 2);
		shape.lineTo(gw / 2, od / 2);
		shape.lineTo(gw / 2, od / 2 - gd);
		shape.lineTo(-gw / 2, od / 2 - gd);
		shape.lineTo(-gw / 2, od / 2);
		shape.lineTo(-ow / 2, od / 2);
		shape.closePath();
		const extrudeSettings = { steps: 1, depth: heightY, bevelEnabled: false };
		const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
		geometry.rotateX(-Math.PI / 2);
		return geometry;
	},

	buildTShapeGeometry(dim) {
		const { stemWidthX: sw, stemDepthZ: sd, crossWidthX: cw, crossDepthZ: cd, crossOffsetZ: co, heightY } = dim;
		const shape = new THREE.Shape();
		const crossZStart = sd / 2 - cd + co;
		const crossZEnd = sd / 2 + co;
		shape.moveTo(-sw / 2, -sd / 2);
		shape.lineTo(sw / 2, -sd / 2);
		shape.lineTo(sw / 2, crossZStart);
		shape.lineTo(cw / 2, crossZStart);
		shape.lineTo(cw / 2, crossZEnd);
		shape.lineTo(-cw / 2, crossZEnd);
		shape.lineTo(-cw / 2, crossZStart);
		shape.lineTo(-sw / 2, crossZStart);
		shape.closePath();
		const extrudeSettings = { steps: 1, depth: heightY, bevelEnabled: false };
		const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
		geometry.rotateX(-Math.PI / 2);
		return geometry;
	},
};

// --- Initialization Logic ---
// This script is loaded as a module. It should only perform its setup
// when the relevant view is loaded and dispatched by the sidebar.

if (typeof window !== 'undefined') {
    // A flag to ensure initialization only happens once.
    let isInitialized = false;

    // Listen for the custom event dispatched by the sidebar/main loader.
    document.addEventListener("viewChanged", (e) => {
        // Check if the new view is the one this module is responsible for.
        if (e.detail.newViewId === 'view-space-size' && !isInitialized) {
            console.log("✅ 'viewChanged' event received for view-space-size. Initializing ContainerPage.");
            try {
                ContainerPage.init();
                isInitialized = true; // Mark as initialized to prevent re-initialization.
            } catch (error) {
                console.error("❌ Error during ContainerPage.init():", error);
            }
        }
    });

    // Fallback for standalone development: if this page is loaded directly,
    // and not through the SPA loader, initialize on DOMContentLoaded.
    document.addEventListener('DOMContentLoaded', () => {
        // The `main-view-active` class would not be present in standalone mode,
        // but checking for the form's existence is a good indicator.
        if (document.getElementById('container-form') && !isInitialized) {
            console.log("✅ Standalone mode detected. Initializing ContainerPage.");
            try {
                ContainerPage.init();
                isInitialized = true;
            } catch (error) {
                console.error("❌ Error during standalone ContainerPage.init():", error);
            }
        }
    });
}