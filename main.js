//? import libraries
import * as THREE from "https://unpkg.com/es-module-shims@1.6.3/dist/es-module-shims.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.132.2/examples/js/controls/OrbitControls.js";
import { FBXLoader } from "https://cdn.jsdelivr.net/npm/three-fbx-loader@1.0.3/index.min.js";
//?  Character Proxy :clase que se encargue de gestionar las animaciones de nuestro personaje, recibir a todas a las animaciones en su constructor y un getter que va a devolver las animaciones

class BasicCharacterControllerProxy {
  constructor(animations) {
    this._animations = animations;
  }

  get animations() {
    return this._animations;
  }
}

//? Character Controller:clase que cargue el personaje, le de la animacion

class BasicCharacterController {
  constructor(params) {
    this._params = params;
    this._deceleration = new THREE.Vector3(-0.005, -0.0001, -5.0);
    this._aceleration = new THREE.Vector3(1, 0.25, 50.0);
    this._velocity = new THREE.Vector3(0, 0, 0);

    this._animations = {};
    this._input = new BasicCharacterControllerInput(); // los eventos de las teclas
    //* Al proxy le pasamos las animaciones
    this._stateMachine = new CharacterFTM(
      new BasicCharacterControllerProxy(this._animations)
    );
    this._loadModels();
  }

  _loadModels() {
    //cargamos el modelo
    const loader = new FBXLoader();
    loader.setPath("./src/paladin/");
    loader.load("Paladin.fbx", (fbx) => {
      fbx.scale.setScalar(0.1); //* escalar el modelo siendo 1 el tamaño original
      //traverse : calculo de sombras
      fbx.traverse((c) => {
        c.castShadow = true;
      });

      this._target = fbx; // vamos a referenciar nuestro modelo

      //ubicar dentro de nuestro escena el elemento
      this._params.scene.add(this._target); // en los params vamos a guardar la scene, y a la scene le agregamos nuestro recurso
      // el mixer va a ser el gestor de animacion
      this._mixer = new THREE.AnimationMixer(this._target);

      //gestionamos el tiempo de carga
      this._manager = new THREE.LoadingManager();
      this._manager.onLoad = () => {
        this._stateMachine.SetState("idle");
      };

      //ejecutar los diferentes clips de animacion
      const _OnLoad = (animName, anim) => {
        const clip = anim.animations[0]; // la primera animacion, la idle, la animacion en si misma
        const action = this._mixer.clipAction(clip); // la acction de esa animacion
        this._animations[animName] = {
          //colocamos el clip y la accion en un objeto asocioado con el nombre del la animacion
          clip: clip,
          action: action,
        };
      };

      //vamos a meter todos los recursos
      const loader = new FBXLoader(this._manager);
      loader.setPath("./src/paladin/");
      loader.load("idle.fbx", (a) => {
        _OnLoad("idle", a);
      });

      loader.load("walk.fbx", (a) => {
        _OnLoad("walk", a);
      });

      loader.load("run.fbx", (a) => {
        _OnLoad("run", a);
      });

      // loader.load("emote.fbx", (a) => {
      //   _OnLoad("emote", a);
      // });
    });
  }
  //metodo update que se va a encargar de calcular de nuestro personaje, que va a ejecutar el bucle dentro de la escena
  _Update(timeInSeconds) {
    if (!this._target) {
      return;
    }

    this._stateMachine.Update(timeInSeconds, this._input);
    const velocity = this._velocity;
    const frameDeceleration = new THREE.Vector2(
      velocity.x * this._deceleration.x,
      velocity.y * this._deceleration.y,
      velocity.z * this._deceleration.z
    );

    frameDeceleration.multiplyScalar(timeInSeconds); //multiplicamos por un escalar, vector por escalar

    //deceletacion en el eje z, vigilar el valor minimo de deceleracion, ya que es posible que se de el caso que la velocidad en el eje z (eje en donde vamos a estas desplazando al personaje) sea menor que la propia deceleracion | math.sign es para saber si es negativo o positivo la deceleracion
    frameDeceleration.z =
      Math.sign(frameDeceleration * z) *
      Math.min(Math.abs(frameDeceleration.z), Math.abs(velocity.z));

    velocity.add(frameDeceleration); // le agregamos la deceleracion

    //aceletate input: aceleracion para determinar el movimiento dependiendo de los imputs,por ejemplo si damos "w" que acelere hacia adelante
    //multiply by timeinseconds: para controlar caidas y subidas de frames

    const controlObject = this._target; // gaurdamos nuestro personaje
    //el vector3 es para el desplazamientp, el quaternion para los calculos de angulo de rotaciones
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    // clonear el quaternion original, la angulacion inicial
    const _R = controlObject.quaternion.clone();
    //ahora copiamos aceleracion inicial de nuestro personaje
    const acc = this._aceleration.clone();

    //tenemos que saber si esta andando o corriendo
    if (this._input._keys.shift) {
      acc.multiplyScalar(3.0);
    }

    if (this._input._keys.forward) {
      velocity.z += acc.z * timeInSeconds;
    }

    if (this._input._keys.backward) {
      velocity.z -= acc.z * timeInSeconds;
    }
    //usando los quaternions, giro angular hacia la izquierda y derecha
    if (this._input._keys.left) {
      _A.set(0, 1, 0);
      // establecemos el angulo que vamos a estar aplicando
      _Q.setFromAxisAngle(
        _A,
        4.0 * Math.PI * timeInSeconds * this._aceleration.y
      );
      _R.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(
        _A,
        4.0 * -Math.PI * timeInSeconds * this._aceleration.y
      ); //solo que de valor contrario que el izquierdo
      _R.multiply(_Q);
    }

    controlObject.quaternion.copy(_R);

    const oldPostiion = new THREE.Vector3();
    oldPostiion.copy(controlObject.position); //copiamos la posicion del personaje

    const forward = new THREE.Vector3(0, 0, 1); //los valores que tienen que tener en funcion del desplazamiento horizontal que esta tomando
    forward.applyQuaternion(controlObject.quaternion); //gestionamos la rotacion

    //! cuando nosotros estamos pulsando una tecla, estamos proporcionando una aceleracion, como el eje z, pero que pasa si toco la tecla de giro y adelante al mismo tiempo, las aceleraciones se van a sumar y se van a volver el doble de rapido, hay que evitar eso, tenemos que hacer que el movimiento sea constante
    forward.normalize();

    //ahora los giros
    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlObject.quaternion);
    sideways.normalize();

    //ahora ese vector que esta normalizado multiplicarlo por la velocidad que queremos y por el tiempo para evitar la caida de frames
    sideways.multiplyScalar(velocity.x * timeInSeconds);
    forward.multiplyScalar(velocity.z * timeInSeconds);

    controlObject.position.add(forward);
    controlObject.position.add(sideways);

    oldPostiion.copy(controlObject.position);
    //actualizar en nuestro mixer la informacion para que aplique a la animacion correspondiente
    if (this._mixer) {
      this._mixer.update(timeInSeconds);
    }
  }
}

//? Character input:clase para los diferente input que pueden modificar el estado del personaje como correr,andar,etc

class BasicCharacterControllerInput {
  //TODO
  constructor() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false, //cambiar entre andar y correr
    };
    document.addEventListener(
      "keydown",
      (e) => {
        this._onKeyDown(e);
      },
      false
    );
    document.addEventListener(
      "keyup",
      (e) => {
        this._onKeyUp(e);
      },
      false
    );
  }

  _onKeyDown(e) {
    switch (e.keyCode) {
      case 87: //w
        this._keys.forward = true;
        break;
      case 65: //a
        this._keys.left = true;
        break;
      case 83: //s
        this._keys.backward = true;
        break;
      case 68: //d
        this._keys.right = true;
        break;
      case 16: //shift
        this._keys.shift = true;
        break;
    }
  }
  _onKeyUp(e) {
    switch (e.keyCode) {
      case 87: //w
        this._keys.forward = false;
        break;
      case 65: //a
        this._keys.left = false;
        break;
      case 83: //s
        this._keys.backward = false;
        break;
      case 68: //d
        this._keys.right = false;
        break;
      case 16: //shift
        this._keys.shift = false;
        break;
    }
  }
}

//? state machine : clase engargada de gestionar transiciones entre animaciones, como por ejemplo: cuando un personaje deja de correr, no va a ponerse en reposo de forma abrupta, sino que exitira una transicion en medio para que se vea mas natural, expresion minima necesaria para controlar los estados de nuestro personaje

class FiniteStateMachine {
  constructor() {
    this._states = {};
    this._currentState = null;
  }

  _AddState(name, type) {
    this._states[name] = type;
  }

  SetState(name) {
    const prevState = this._currentState; //guardamos es estado previo

    if (prevState) {
      if (prevState.Name === name) {
        //si el estado es run, pero me piden que cambie el estado a run nuevamente, no debo hacer nada por eso return
        return;
      }
      prevState.Exit(); // salimos del estado previo
    }

    const state = new this._states[name](this); // extraemos el estado con el name
    this._currentState = state; //  para indicar que se ha cambiado al nuevo estado creado.
    state.Enter(prevState);
  }

  UpdateState(timeElapsed, input) {
    if (this._currentState) {
      this._currentState.Update(timeElapsed, input);
    }
  }
}

//Character State Machine

class CharacterFTM extends FiniteStateMachine {
  constructor(proxy) {
    super();
    this._proxy = proxy;
    this._AddState("idle", IdleState);
    this._AddState("walk", WalkState);
    this._AddState("run", RunState);
    this._AddState("emote", EmoteState);
  }
}

//Character States

class State {
  constructor(parent) {
    this._parent = parent;
  }

  Enter() {
    //TODO
  }

  Exit() {
    //TODO
  }

  Update() {
    //TODO
  }
}

class IdleState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return "idle";
  }
  // entremos en el estado de reposo, vamos a ejecutar la animacion de reposo
  Enter(prevState) {
    const idleAction = this._parent._proxy._animations["idle"].action; // primero establecemos que la accion de animacion que vamos a ejecutar es la de reposo

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action; //tenemos que tener en cuenta el estado anterior para hacer la  transicion de un estado al otro
      idleAction.time = 0.0; // a la accion el tiempo lo vamos estar estableciendo a 0
      idleAction.enable = true; //vamos a habilitar a la action
      idleAction.setEffectiveTimeScale(1.0); //no vamos a duplicar la velocidad
      idleAction.setEffectiveWeight(1.0); //vamos a dejarle el peso por defecto
      idleAction.crossFadeFrom(prevAction, 0.5, true); //establecer la transicion entre el estado anterior y el actual
      idleAction.play(); //ejecutamos la accion
    } else {
      idleAction.play(); // solo lanzamos la accion si no hay estado previo
    }
  }

  Exit() {
    // TODO
  }

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      this._parent.SetState("walk");
    }
  }
}

class WalkState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return "walk";
  }

  Enter(prevState) {
    const currAction = this._parent._proxy._animations["walk"].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      currAction.enable = true;

      if (prevState.Name === "run") {
        //el ratio de nuestra duracion, para aplixar al time, y corregir nuestro suavizador
        const ratio =
          currAction.getClip().duration / prevAction.getClip().duration;
        currAction.time = prevAction.time * ratio; // suavizamos
      } else {
        currAction.time = 0.0;
        currAction.setEffectiveTimeScale(1.0);
        currAction.setEffectiveWeight(1.0);
      }

      currAction.crossFadeFrom(prevAction, 0.5, true);
      currAction.play();
    } else {
      currAction.play();
    }
  }

  Exit() {}

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      if (input._keys.shift) {
        this._parent.SetState("run");
      }
      return;
    }
    this._parent.SetState("idle"); //se queda en reposo si no se teclea 'w' o 'a'
  }
}

class RunState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return "run";
  }

  Enter(prevState) {
    const currAction = this._parent._proxy._animations["run"].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      currAction.enable = true;

      if (prevState.Name === "walk") {
        //el ratio de nuestra duracion, para aplixar al time, y corregir nuestro suavizador
        const ratio =
          currAction.getClip().duration / prevAction.getClip().duration;
        currAction.time = prevAction.time * ratio; // suavizamos
      } else {
        currAction.time = 0.0;
        currAction.setEffectiveTimeScale(1.0);
        currAction.setEffectiveWeight(1.0);
      }

      currAction.crossFadeFrom(prevAction, 0.5, true);
      currAction.play();
    } else {
      currAction.play();
    }
  }

  Exit() {}

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      if (!input._keys.shift) {
        this._parent.SetState("walk");
      }
      return;
    }
    this._parent.SetState("idle");
  }
}

class EmoteState extends State {
  //TODO
}

//Scene: clase donde se encuentra la escena del personaje
