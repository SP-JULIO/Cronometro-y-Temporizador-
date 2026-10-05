(() => { // Expresión de función invocada inmediatamente (IIFE) para aislar el ámbito y no contaminar el objeto global window
  'use strict'; // Habilita el modo estricto para evitar malas prácticas, variables no declaradas y fallos silenciosos
  // ===== Constantes ===== // Sección de definición de valores constantes fijos
  const MAX_STOPWATCH_MS = 5999990; // Límite máximo del cronómetro: 99 min, 59 seg y 99 centésimas expresado en milisegundos
  const MAX_MINUTES = 99; // Valor máximo admisible para el campo de minutos
  const MAX_SECONDS = 59; // Valor máximo admisible para el campo de segundos
  const MIN_TOTAL_MS = 1000; // Tiempo mínimo configurable para el temporizador (1 segundo en milisegundos)
  const FALLBACK_INTERVAL_MS = 250; // Intervalo de respaldo en ms con setInterval por si requestAnimationFrame se congela en segundo plano
  const BEEP_COUNT = 3; // Número de pitidos que sonarán cuando el temporizador llegue a cero
  const BEEP_DURATION_SEC = 0.15; // Duración de cada pitido sonoro individual en segundos
  const BEEP_PAUSE_SEC = 0.1; // Pausa de silencio entre cada pitido en segundos
  const BEEP_FREQUENCY_HZ = 880; // Tono sonoro de la alarma en hercios (Hz), equivalente a la nota musical La5 (A5)
  const FORBIDDEN_KEY_CHARS = Object.freeze(['e', 'E', '+', '-', '.', ',']); // Arreglo inmutable con caracteres no permitidos en entradas numéricas
  const STATE = Object.freeze({ // Objeto inmutable que enumera los estados del reloj
    IDLE: 'idle', // Estado inactivo / en reposo
    RUNNING: 'running', // Estado en ejecución activa
    PAUSED: 'paused', // Estado en pausa
    FINISHED: 'finished' // Estado finalizado (cuando la cuenta regresiva llega a cero)
  }); // Cierre del enum de estados
  const MODE = Object.freeze({ // Objeto inmutable que define los modos disponibles de la aplicación
    STOPWATCH: 'stopwatch', // Modo cronómetro
    COUNTDOWN: 'countdown' // Modo temporizador
  }); // Cierre del enum de modos
  // ===== Utilidades ===== // Funciones auxiliares reutilizables
  const formatTime = (ms, options = {}) => { // Convierte milisegundos a formato de texto legible MM:SS o MM:SS.ms
    const opts = typeof options === 'boolean' ? { isCeil: options } : options; // Normaliza el parámetro options si se pasó solo un booleano
    const { isCeil = false, showMs = false } = opts; // Extrae banderas de redondeo hacia arriba y visualización de milisegundos
    const safeMs = Math.max(0, ms); // Garantiza que los milisegundos nunca sean un número negativo
    if (showMs) { // Si se solicitó mostrar milisegundos (usado por el cronómetro)
      const clampedMs = Math.min(MAX_STOPWATCH_MS, safeMs); // Delimita el tiempo al valor máximo permitido
      const totalSeconds = Math.floor(clampedMs / 1000); // Convierte milisegundos a segundos enteros
      const minutes = Math.min(MAX_MINUTES, Math.floor(totalSeconds / 60)); // Calcula los minutos sin exceder el máximo
      const seconds = totalSeconds % 60; // Extrae el residuo de segundos restantes
      const hundredths = Math.floor((clampedMs % 1000) / 10); // Obtiene las centésimas de segundo (2 dígitos)
      const mStr = String(minutes).padStart(2, '0'); // Rellena con un cero a la izquierda si los minutos son menores a 10
      const sStr = String(seconds).padStart(2, '0'); // Rellena con un cero a la izquierda los segundos
      const msStr = String(hundredths).padStart(2, '0'); // Rellena con un cero a la izquierda las centésimas
      return `${mStr}:${sStr}.${msStr}`; // Retorna el formato completo "MM:SS.ms"
    } // Fin del bloque condicional para milisegundos
    const totalSeconds = isCeil // Si no requiere milisegundos (usado por el temporizador)
      ? Math.ceil(safeMs / 1000) // Redondea al segundo superior para no mostrar 00:00 antes de tiempo
      : Math.floor(safeMs / 1000); // O trunca hacia abajo según la opción seleccionada
    const clampedTotal = Math.min(MAX_MINUTES * 60 + MAX_SECONDS, totalSeconds); // Limita el total de segundos al tope máximo
    const minutes = Math.floor(clampedTotal / 60); // Obtiene los minutos totales
    const seconds = clampedTotal % 60; // Obtiene los segundos restantes
    const mStr = String(minutes).padStart(2, '0'); // Convierte y da formato a 2 dígitos para minutos
    const sStr = String(seconds).padStart(2, '0'); // Convierte y da formato a 2 dígitos para segundos
    return `${mStr}:${sStr}`; // Retorna el formato simple "MM:SS"
  }; // Fin de la función formatTime
  const parseTimerInput = (minutesVal, secondsVal) => { // Valida y transforma los datos ingresados en el formulario de temporizador
    const mStr = String(minutesVal ?? '').trim(); // Convierte los minutos a texto y elimina espacios sobrantes
    const sStr = String(secondsVal ?? '').trim(); // Convierte los segundos a texto y elimina espacios sobrantes
    if (mStr === '' || sStr === '') { // Valida que ningún campo se haya dejado vacío
      return { // Retorna resultado fallido
        ok: false, // Indica que la validación no pasó
        ms: 0, // Milisegundos resultantes en 0
        errorMessage: 'Completa los campos de minutos y segundos' // Mensaje de error para el usuario
      }; // Cierre del objeto retornado
    } // Fin de la verificación de vacíos
    if (!/^\d+$/.test(mStr) || !/^\d+$/.test(sStr)) { // Comprueba mediante expresión regular que solo existan dígitos del 0 al 9
      return { // Retorna resultado fallido
        ok: false, // Validación no superada
        ms: 0, // 0 milisegundos
        errorMessage: 'Ingresa solo números enteros positivos' // Mensaje de advertencia
      }; // Cierre del objeto retornado
    } // Fin de verificación de dígitos
    const m = Number.parseInt(mStr, 10); // Convierte la cadena de minutos a número entero en base 10
    const s = Number.parseInt(sStr, 10); // Convierte la cadena de segundos a número entero en base 10
    if (Number.isNaN(m) || Number.isNaN(s)) { // Verifica si la conversión arrojó NaN (Not a Number)
      return { // Retorna resultado fallido
        ok: false, // Validación no superada
        ms: 0, // 0 milisegundos
        errorMessage: 'Valores numéricos inválidos' // Mensaje de error
      }; // Cierre del objeto retornado
    } // Fin de verificación de NaN
    if (m < 0 || m > MAX_MINUTES) { // Comprueba que los minutos estén dentro del rango permitido (0 a 99)
      return { // Retorna resultado fallido
        ok: false, // Validación no superada
        ms: 0, // 0 milisegundos
        errorMessage: `Los minutos deben estar entre 0 y ${MAX_MINUTES}` // Mensaje dinámico de error
      }; // Cierre del objeto retornado
    } // Fin de validación de rango de minutos
    if (s < 0 || s > MAX_SECONDS) { // Comprueba que los segundos estén dentro del rango permitido (0 a 59)
      return { // Retorna resultado fallido
        ok: false, // Validación no superada
        ms: 0, // 0 milisegundos
        errorMessage: `Los segundos deben estar entre 0 y ${MAX_SECONDS}` // Mensaje dinámico de error
      }; // Cierre del objeto retornado
    } // Fin de validación de rango de segundos
    const totalMs = (m * 60 + s) * 1000; // Calcula el tiempo total acumulado en milisegundos
    if (totalMs < MIN_TOTAL_MS) { // Comprueba que el tiempo total sea al menos de 1 segundo
      return { // Retorna resultado fallido
        ok: false, // Validación no superada
        ms: 0, // 0 milisegundos
        errorMessage: 'Ingresa un tiempo mayor a 0' // Mensaje de advertencia
      }; // Cierre del objeto retornado
    } // Fin de validación de tiempo mínimo
    return { // Retorna el objeto de éxito si todas las reglas fueron superadas
      ok: true, // Validación exitosa
      ms: totalMs, // Tiempo total calculado en milisegundos
      minutes: m, // Minutos validados
      seconds: s, // Segundos validados
      errorMessage: '' // Cadena de error vacía
    }; // Cierre del objeto retornado
  }; // Fin de parseTimerInput
  const computeLapStats = (laps) => { // Determina cuál vuelta fue la más rápida y cuál la más lenta
    if (!laps || laps.length < 3) { // Requiere un mínimo de 3 vueltas para realizar una comparación significativa
      return { fastestId: null, slowestId: null }; // Si hay menos de 3 vueltas, no resalta ninguna
    } // Fin del caso base
    const splits = laps.map((lap) => lap.splitMs); // Extrae solo los tiempos individuales de cada vuelta a un arreglo
    const firstSplit = splits[0]; // Guarda el tiempo de la primera vuelta
    const allEqual = splits.every((split) => split === firstSplit); // Comprueba si todas las vueltas tuvieron exactamente la misma duración
    if (allEqual) { // Si todas las vueltas son idénticas en tiempo
      return { fastestId: null, slowestId: null }; // No hay ni más rápida ni más lenta
    } // Fin de la verificación de igualdad
    let minVal = splits[0]; // Inicializa el menor valor con la primera vuelta
    let maxVal = splits[0]; // Inicializa el mayor valor con la primera vuelta
    for (let i = 1; i < splits.length; i += 1) { // Recorre el arreglo a partir de la segunda vuelta
      if (splits[i] < minVal) { // Si encuentra una vuelta más corta
        minVal = splits[i]; // Actualiza el récord mínimo
      } // Fin de actualización de mínimo
      if (splits[i] > maxVal) { // Si encuentra una vuelta más larga
        maxVal = splits[i]; // Actualiza el récord máximo
      } // Fin de actualización de máximo
    } // Fin del ciclo de búsqueda
    const fastestLap = laps.find((lap) => lap.splitMs === minVal); // Busca el objeto de vuelta correspondiente al tiempo mínimo
    const slowestLap = laps.find((lap) => lap.splitMs === maxVal); // Busca el objeto de vuelta correspondiente al tiempo máximo
    return { // Retorna los identificadores de las vueltas destacadas
      fastestId: fastestLap ? fastestLap.id : null, // ID de la vuelta más rápida
      slowestId: slowestLap ? slowestLap.id : null // ID de la vuelta más lenta
    }; // Cierre del objeto retornado
  }; // Fin de computeLapStats
  // ===== Servicio de audio ===== // Gestiona la síntesis de sonido con Web Audio API
  class AlarmPlayer { // Clase encargada de reproducir la alarma sonora
    #audioContext = null; // Campo privado para almacenar la instancia de AudioContext
    #activeNodes = []; // Campo privado para rastrear nodos de audio activos y poder cancelarlos
    init() { // Inicializa o reactiva el contexto de audio según las políticas del navegador
      if (!this.#audioContext) { // Si el contexto aún no ha sido instanciado
        const AudioContextClass = window.AudioContext || window.webkitAudioContext; // Obtiene el constructor estándar o con prefijo de Safari
        if (AudioContextClass) { // Si el navegador soporta Web Audio API
          this.#audioContext = new AudioContextClass(); // Crea la nueva instancia de AudioContext
        } // Fin de comprobación de clase
      } // Fin de comprobación de instancia
      if (this.#audioContext && this.#audioContext.state === 'suspended') { // Si el audio está suspendido por falta de interacción del usuario
        this.#audioContext.resume().catch(() => {}); // Intenta reanudar el audio ignorando posibles errores
      } // Fin de reanudación
    } // Fin del método init
    play() { // Genera y reproduce la secuencia de pitidos
      this.stop(); // Detiene cualquier reproducción activa previa
      this.init(); // Asegura que el contexto esté inicializado y activo
      if (!this.#audioContext) { // Si no hay contexto de audio disponible en el dispositivo
        return; // Sale sin hacer nada
      } // Fin de comprobación
      const ctx = this.#audioContext; // Referencia local rápida al AudioContext
      const startTimeBase = ctx.currentTime; // Obtiene la marca de tiempo de audio actual de alta precisión
      for (let i = 0; i < BEEP_COUNT; i += 1) { // Genera cada uno de los 3 pitidos programados
        const beepStart = startTimeBase + i * (BEEP_DURATION_SEC + BEEP_PAUSE_SEC); // Calcula el segundo exacto de inicio del pitido
        const beepEnd = beepStart + BEEP_DURATION_SEC; // Calcula el segundo exacto en que debe terminar el pitido
        const osc = ctx.createOscillator(); // Crea un oscilador para generar la onda de sonido
        const gain = ctx.createGain(); // Crea un nodo de ganancia para controlar el volumen
        osc.type = 'sine'; // Configura la forma de onda como senoidal (sonido puro y limpio)
        osc.frequency.setValueAtTime(BEEP_FREQUENCY_HZ, beepStart); // Asigna la frecuencia de 880Hz en el momento de inicio
        gain.gain.setValueAtTime(0.0001, beepStart); // Inicia el volumen casi a cero para evitar chasquidos acústicos
        gain.gain.exponentialRampToValueAtTime(0.25, beepStart + 0.02); // Sube el volumen gradualmente hasta 0.25 (ataque)
        gain.gain.exponentialRampToValueAtTime(0.0001, beepEnd); // Baja el volumen gradualmente hasta casi cero al final (caída)
        osc.connect(gain); // Conecta el oscilador al nodo de volumen
        gain.connect(ctx.destination); // Conecta el nodo de volumen a la salida física de altavoces
        osc.start(beepStart); // Programa el encendido del oscilador
        osc.stop(beepEnd); // Programa el apagado del oscilador
        this.#activeNodes.push({ osc, gain }); // Guarda las referencias para poder detenerlos inmediatamente si es necesario
        osc.onended = () => { // Callback que se ejecuta cuando el oscilador termina su ciclo
          try { // Manejo de excepciones al desconectar nodos
            osc.disconnect(); // Desconecta el oscilador para liberar recursos de memoria
            gain.disconnect(); // Desconecta el nodo de ganancia
          } catch (_) {} // Captura y descarta cualquier error silenciosamente
        }; // Fin de onended
      } // Fin del bucle de pitidos
    } // Fin del método play
    stop() { // Detiene y silencia de inmediato todos los sonidos en curso
      for (const { osc, gain } of this.#activeNodes) { // Itera sobre cada nodo activo almacenado
        try { // Manejo de excepciones
          osc.stop(); // Detiene el oscilador
          osc.disconnect(); // Desconecta el oscilador
          gain.disconnect(); // Desconecta la ganancia
        } catch (_) {} // Ignora errores si ya estaban desconectados
      } // Fin de iteración
      this.#activeNodes = []; // Limpia el arreglo de nodos activos
    } // Fin del método stop
  } // Fin de la clase AlarmPlayer
  // ===== Lógica de reloj ===== // Base para temporizadores y cronómetros
  class Clock { // Clase padre abstracta que contiene el motor de tiempo base
    #state = STATE.IDLE; // Estado inicial privado del reloj (en reposo)
    #startTime = 0; // Marca de tiempo (timestamp Date.now()) de cuándo arrancó
    #accumulatedTime = 0; // Tiempo total acumulado antes de la última pausa
    #rafId = null; // Identificador para la animación vía requestAnimationFrame
    #intervalId = null; // Identificador para el temporizador de respaldo con setInterval
    #onTick = null; // Callback invocado en cada actualización de tiempo
    #onStateChange = null; // Callback invocado ante un cambio de estado
    constructor({ onTick, onStateChange } = {}) { // Constructor que recibe callbacks de ciclo de vida
      this.#onTick = onTick ?? null; // Almacena el callback de actualización o null
      this.#onStateChange = onStateChange ?? null; // Almacena el callback de cambio de estado o null
    } // Fin del constructor
    get state() { // Getter público para consultar el estado actual del reloj
      return this.#state; // Retorna el valor del campo privado #state
    } // Fin del getter state
    _setState(newState) { // Método protegido para modificar el estado y disparar eventos
      if (this.#state === newState) { // Si el estado no cambia, evita trabajo innecesario
        return; // Sale sin notificar
      } // Fin de verificación
      this.#state = newState; // Actualiza el estado privado
      if (this.#onStateChange) { // Si hay un oyente registrado para cambios de estado
        this.#onStateChange(this.#state); // Notifica el nuevo estado
      } // Fin de notificación
    } // Fin de _setState
    _getDelta() { // Calcula el tiempo transcurrido desde el último start()
      if (this.#state !== STATE.RUNNING) { // Si el reloj no está corriendo activamente
        return 0; // No hay diferencia acumulándose
      } // Fin de verificación
      const delta = Date.now() - this.#startTime; // Diferencia entre el momento actual y el de arranque
      return delta > 0 ? delta : 0; // Asegura que nunca sea negativo si el reloj del sistema salta
    } // Fin de _getDelta
    getElapsedTime() { // Retorna el tiempo total transcurrido (acumulado previo + diferencia actual)
      return this.#accumulatedTime + this._getDelta(); // Suma el tiempo antes de pausar y el lapso actual
    } // Fin de getElapsedTime
    _startLoops(tickFn) { // Inicia los ciclos de actualización concurrentes
      this._stopLoops(); // Limpia ciclos previos para no duplicar procesos
      const loop = () => { // Función recursiva para sincronización fluida con la pantalla
        if (this.#state === STATE.RUNNING) { // Mientras siga corriendo
          tickFn(); // Ejecuta la función de actualización
          this.#rafId = requestAnimationFrame(loop); // Solicita el siguiente fotograma al navegador (~60fps)
        } // Fin de verificación de estado
      }; // Fin de definición de loop
      this.#rafId = requestAnimationFrame(loop); // Dispara la primera animación fluida
      this.#intervalId = setInterval(() => { // Bucle de respaldo por si el navegador ralentiza pestañas en segundo plano
        if (this.#state === STATE.RUNNING) { // Mientras siga corriendo
          tickFn(); // Ejecuta la función de actualización periódica
        } // Fin de verificación
      }, FALLBACK_INTERVAL_MS); // Se ejecuta cada 250 milisegundos
    } // Fin de _startLoops
    _stopLoops() { // Cancela y resetea todos los bucles de ejecución
      if (this.#rafId !== null) { // Si hay un frame programado
        cancelAnimationFrame(this.#rafId); // Cancela la animación programada
        this.#rafId = null; // Reinicia el ID a null
      } // Fin de cancelación de RAF
      if (this.#intervalId !== null) { // Si hay un intervalo de respaldo corriendo
        clearInterval(this.#intervalId); // Limpia el intervalo
        this.#intervalId = null; // Reinicia el ID a null
      } // Fin de cancelación de interval
    } // Fin de _stopLoops
    _notifyTick(ms) { // Dispara el callback para avisar del tiempo actual a la vista
      if (this.#onTick) { // Si existe la función callback
        this.#onTick(ms); // Llama la función pasando los milisegundos
      } // Fin de comprobación
    } // Fin de _notifyTick
    start() { // Inicia la marcha del reloj
      if (this.#state === STATE.RUNNING) { // Si ya está corriendo
        return; // No hace nada para evitar reinicios accidentales
      } // Fin de comprobación
      this.#startTime = Date.now(); // Guarda el momento exacto de inicio
      this._setState(STATE.RUNNING); // Cambia el estado a RUNNING
    } // Fin de start
    pause() { // Pausa el reloj reteniendo el tiempo transcurrido
      if (this.#state !== STATE.RUNNING) { // Solo se puede pausar si está en marcha
        return; // Sale de la función
      } // Fin de comprobación
      this.#accumulatedTime += this._getDelta(); // Acumula el tiempo transcurrido en el lapso actual
      this._stopLoops(); // Detiene los bucles de actualización
      this._setState(STATE.PAUSED); // Cambia el estado a PAUSED
    } // Fin de pause
    reset() { // Restablece el reloj a su estado inicial
      this._stopLoops(); // Detiene todos los bucles
      this.#accumulatedTime = 0; // Pone en cero el tiempo acumulado
      this.#startTime = 0; // Pone en cero la marca de tiempo
      this._setState(STATE.IDLE); // Cambia el estado a reposo (IDLE)
    } // Fin de reset
  } // Fin de la clase Clock
  // ===== Cronómetro ===== // Especialización de Clock para cronómetro con vueltas
  class Stopwatch extends Clock { // Hereda las capacidades de tiempo de la clase base Clock
    #laps = []; // Arreglo privado con el historial de vueltas registradas
    #onLapsChange = null; // Callback para notificar cambios en la lista de vueltas
    constructor({ onTick, onStateChange, onLapsChange } = {}) { // Constructor con parámetros de configuración
      super({ onTick, onStateChange }); // Invoca al constructor de la clase padre Clock
      this.#onLapsChange = onLapsChange ?? null; // Asigna el callback de vueltas
    } // Fin del constructor
    get laps() { // Getter para acceder a las vueltas
      return [...this.#laps]; // Retorna una copia superficial para proteger el arreglo original de mutaciones externas
    } // Fin del getter laps
    start() { // Arranca el cronómetro
      if (this.state === STATE.RUNNING) { // Si ya está en ejecución
        return; // Sale de la función
      } // Fin de verificación
      if (this.getElapsedTime() >= MAX_STOPWATCH_MS) { // Si ya alcanzó el límite máximo de 99:59.99
        return; // No permite iniciar más
      } // Fin de verificación de límite
      super.start(); // Llama al método start() de Clock
      this._startLoops(() => this.#tick()); // Inicia los bucles ejecutando el método privado #tick
    } // Fin de start
    #tick() { // Maneja cada ciclo de reloj del cronómetro
      let elapsed = this.getElapsedTime(); // Obtiene el tiempo transcurrido total
      if (elapsed >= MAX_STOPWATCH_MS) { // Si sobrepasa el límite máximo
        elapsed = MAX_STOPWATCH_MS; // Fija el tiempo exactamente en el tope
        this.pause(); // Pausa automáticamente el cronómetro
        this._notifyTick(MAX_STOPWATCH_MS); // Notifica el valor tope
        return; // Termina la ejecución del tick
      } // Fin de validación de tope
      this._notifyTick(elapsed); // Notifica el tiempo transcurrido a la vista
    } // Fin de #tick
    sync() { // Sincroniza inmediatamente la visualización tras reenfocar la ventana
      if (this.state === STATE.RUNNING) { // Solo si está activo
        this.#tick(); // Fuerza una actualización inmediata de pantalla
      } // Fin de comprobación
    } // Fin de sync
    pause() { // Pausa el cronómetro
      super.pause(); // Ejecuta la pausa base
      this._notifyTick(this.getElapsedTime()); // Asegura que la pantalla muestre el valor exacto en el que quedó pausado
    } // Fin de pause
    reset() { // Reinicia el cronómetro y limpia el registro de vueltas
      super.reset(); // Ejecuta el reseteo base de Clock
      this.#laps = []; // Vacía la lista de vueltas
      if (this.#onLapsChange) { // Si hay callback para cambios en vueltas
        this.#onLapsChange([]); // Notifica que la lista ahora está vacía
      } // Fin de notificación
      this._notifyTick(0); // Notifica a la vista que el tiempo ahora es 0
    } // Fin de reset
    lap() { // Registra una nueva vuelta (lap)
      if (this.state !== STATE.RUNNING) { // Solo se pueden grabar vueltas si está corriendo
        return null; // Si está pausado o en reposo, no hace nada
      } // Fin de comprobación
      const currentMs = Math.min(MAX_STOPWATCH_MS, this.getElapsedTime()); // Obtiene el tiempo total actual limitado al máximo
      const previousTotal = this.#laps.length > 0 // Determina el tiempo acumulado de la última vuelta
        ? this.#laps[this.#laps.length - 1].totalMs // Usa el total acumulado de la vuelta anterior
        : 0; // O 0 si es la primera vuelta
      const splitMs = Math.max(0, currentMs - previousTotal); // Calcula el tiempo diferencial (parcial) de esta vuelta
      const lapNumber = this.#laps.length + 1; // Genera el número correlativo de la nueva vuelta
      const newLap = { // Crea el objeto representativo de la vuelta
        id: lapNumber, // Identificador único de la vuelta
        lapNumber, // Número de la vuelta
        splitMs, // Tiempo parcial que tardó esta vuelta individual
        totalMs: currentMs // Tiempo total acumulado del cronómetro en este momento
      }; // Cierre del objeto
      this.#laps.push(newLap); // Agrega la vuelta al registro privado
      if (this.#onLapsChange) { // Si hay callback de notificación
        this.#onLapsChange([...this.#laps]); // Envía una copia del arreglo actualizado
      } // Fin de notificación
      return newLap; // Retorna la vuelta creada
    } // Fin de lap
  } // Fin de la clase Stopwatch
  // ===== Temporizador ===== // Especialización de Clock para cuenta regresiva
  class Countdown extends Clock { // Hereda de Clock
    #durationMs = 0; // Duración activa restante en milisegundos
    #configuredDurationMs = 0; // Duración inicial fijada por el usuario (para reinicios)
    #onFinish = null; // Callback ejecutado cuando el tiempo llega a cero
    #isFinished = false; // Bandera booleana para evitar múltiples ejecuciones de fin
    constructor({ onTick, onStateChange, onFinish } = {}) { // Constructor del temporizador
      super({ onTick, onStateChange }); // Invoca el constructor padre
      this.#onFinish = onFinish ?? null; // Guarda el callback de finalización
    } // Fin del constructor
    get durationMs() { // Getter para consultar la duración actual configurada
      return this.#durationMs; // Retorna la duración en ms
    } // Fin del getter durationMs
    get isFinished() { // Getter para comprobar si el temporizador ha finalizado
      return this.state === STATE.FINISHED; // Retorna true si está en estado FINISHED
    } // Fin del getter isFinished
    setDuration(ms) { // Establece una nueva duración al temporizador
      if (this.state === STATE.RUNNING || this.state === STATE.PAUSED) { // No permite cambiar la duración en marcha o pausa
        return; // Sale sin realizar cambios
      } // Fin de verificación
      this.#durationMs = Math.max(0, ms); // Asigna la duración asegurando que sea positiva
      this.#configuredDurationMs = this.#durationMs; // Guarda la configuración para poder resetear luego
      this._notifyTick(this.#durationMs); // Notifica a la pantalla para mostrar el tiempo configurado
    } // Fin de setDuration
    start() { // Inicia la cuenta regresiva
      if (this.state === STATE.RUNNING || this.#durationMs <= 0) { // Si ya corre o la duración es cero o menor
        return; // No inicia
      } // Fin de verificación
      this.#isFinished = false; // Limpia la bandera de finalizado
      super.start(); // Arranca el reloj base
      this._startLoops(() => this.#tick()); // Inicia los ciclos ejecutando #tick
    } // Fin de start
    #tick() { // Evalúa el tiempo restante en cada ciclo
      if (this.state !== STATE.RUNNING) { // Si no está corriendo
        return; // Sale
      } // Fin de comprobación
      const elapsed = this.getElapsedTime(); // Tiempo transcurrido desde que arrancó
      const remaining = this.#durationMs - elapsed; // Calcula cuánto tiempo resta
      if (remaining <= 0) { // Si se agotó el tiempo
        this.#handleFinish(); // Dispara las acciones de fin de temporizador
        return; // Termina el tick
      } // Fin de verificación de fin
      this._notifyTick(remaining); // Notifica el tiempo restante actualizado a la pantalla
    } // Fin de #tick
    sync() { // Sincroniza tras volver a enfocar la pestaña
      if (this.state === STATE.RUNNING) { // Si está corriendo
        this.#tick(); // Actualiza inmediatamente
      } // Fin de comprobación
    } // Fin de sync
    #handleFinish() { // Ejecuta las acciones correspondientes al agotarse el tiempo
      if (this.#isFinished || this.state !== STATE.RUNNING) { // Si ya se procesó el fin o no estaba corriendo
        return; // Evita disparar alertas dobles
      } // Fin de comprobación
      this.#isFinished = true; // Marca como finalizado
      this._stopLoops(); // Detiene los bucles de actualización
      this._setState(STATE.FINISHED); // Cambia el estado a FINISHED
      this._notifyTick(0); // Asegura que la pantalla muestre exactamente 00:00
      if (this.#onFinish) { // Si hay callback registrado para el final
        this.#onFinish(); // Lo invoca (hará sonar la alarma)
      } // Fin de notificación
    } // Fin de #handleFinish
    pause() { // Pausa la cuenta regresiva
      if (this.state !== STATE.RUNNING) { // Solo si está corriendo
        return; // Sale
      } // Fin de comprobación
      super.pause(); // Aplica la pausa base
      const remaining = Math.max(0, this.#durationMs - this.getElapsedTime()); // Calcula con precisión el remanente
      this._notifyTick(remaining); // Muestra el remanente congelado
    } // Fin de pause
    reset() { // Restablece el temporizador a su tiempo original configurado
      this.#isFinished = false; // Desactiva la bandera de finalizado
      super.reset(); // Resetea el reloj base
      this._notifyTick(this.#configuredDurationMs); // Restablece la pantalla al tiempo inicial que tenía configurado
    } // Fin de reset
  } // Fin de la clase Countdown
  // ===== Vista de pestañas ===== // Manejo de la interfaz accesible de navegación entre modos
  class TabsView { // Controla la interacción por teclado y clics en las pestañas
    #tabElements = []; // Lista de botones de pestaña
    #panelElements = []; // Lista de secciones/paneles asociados
    #onTabSelect = null; // Callback invocado al seleccionar una pestaña
    constructor({ tabElements, panelElements, onTabSelect }) { // Constructor con los elementos del DOM necesarios
      this.#tabElements = Array.from(tabElements); // Convierte la NodeList de pestañas a un arreglo nativo
      this.#panelElements = Array.from(panelElements); // Convierte la NodeList de paneles a un arreglo nativo
      this.#onTabSelect = onTabSelect ?? null; // Guarda el callback de cambio de pestaña
      this.#bindEvents(); // Vincula los oyentes de eventos
    } // Fin del constructor
    #bindEvents() { // Asigna eventos de clic y teclado según el estándar WAI-ARIA
      this.#tabElements.forEach((tab, index) => { // Itera sobre cada botón de pestaña
        tab.addEventListener('click', () => { // Escucha el evento de clic
          this.setActiveTab(tab.id); // Activa la pestaña cliqueada
        }); // Fin de listener click
        tab.addEventListener('keydown', (event) => { // Soporte para navegación accesible con teclado
          let nextIndex = null; // Variable para almacenar el índice de la siguiente pestaña a enfocar
          if (event.key === 'ArrowRight') { // Si presiona la tecla de flecha derecha
            nextIndex = (index + 1) % this.#tabElements.length; // Avanza circularmente a la siguiente
          } else if (event.key === 'ArrowLeft') { // Si presiona flecha izquierda
            nextIndex = (index - 1 + this.#tabElements.length) % this.#tabElements.length; // Retrocede circularmente a la anterior
          } else if (event.key === 'Home') { // Si presiona la tecla Inicio (Home)
            nextIndex = 0; // Salta a la primera pestaña
          } else if (event.key === 'End') { // Si presiona la tecla Fin (End)
            nextIndex = this.#tabElements.length - 1; // Salta a la última pestaña
          } // Fin de evaluación de teclas
          if (nextIndex !== null) { // Si coincidió con alguna de las teclas de navegación
            event.preventDefault(); // Evita el comportamiento por defecto de la tecla (como el scroll)
            const nextTab = this.#tabElements[nextIndex]; // Obtiene la pestaña de destino
            nextTab.focus(); // Coloca el foco del cursor sobre ella
            this.setActiveTab(nextTab.id); // Activa la pestaña enfocada
          } // Fin de navegación
        }); // Fin de listener keydown
      }); // Fin de forEach
    } // Fin de #bindEvents
    setActiveTab(activeTabId) { // Cambia visual y semánticamente la pestaña activa
      this.#tabElements.forEach((tab) => { // Recorre todas las pestañas
        const isActive = tab.id === activeTabId; // Evalúa si es la pestaña seleccionada
        tab.classList.toggle('tabs__item--active', isActive); // Agrega o quita la clase CSS activa
        tab.setAttribute('aria-selected', String(isActive)); // Actualiza el atributo de accesibilidad aria-selected
        tab.setAttribute('tabindex', isActive ? '0' : '-1'); // Permite tabular solo a la pestaña activa (tabindex="0")
        const controlsId = tab.getAttribute('aria-controls'); // Obtiene el ID del panel que controla esta pestaña
        const panel = this.#panelElements.find((p) => p.id === controlsId); // Encuentra el elemento del panel en el DOM
        if (panel) { // Si existe el panel
          if (isActive) { // Si la pestaña está activa
            panel.removeAttribute('hidden'); // Quita el atributo hidden para mostrarlo
            panel.classList.add('panel--active'); // Añade la clase visual activa
          } else { // Si la pestaña está inactiva
            panel.setAttribute('hidden', ''); // Oculta el panel con el atributo hidden
            panel.classList.remove('panel--active'); // Quita la clase visual activa
          } // Fin de toggle de panel
        } // Fin de panel existente
      }); // Fin de forEach
      if (this.#onTabSelect) { // Si hay callback configurado
        this.#onTabSelect(activeTabId); // Notifica el ID de la pestaña que se acaba de activar
      } // Fin de notificación
    } // Fin de setActiveTab
  } // Fin de la clase TabsView
  // ===== Vista de cronómetro ===== // Manipulación del DOM para el cronómetro
  class StopwatchView { // Gestiona los elementos visuales y el DOM del cronómetro
    #display = null; // Elemento contenedor de la pantalla digital
    #timeElement = null; // Elemento span contenedor del texto del tiempo
    #mainTimeElement = null; // Elemento span para minutos y segundos (MM:SS)
    #msTimeElement = null; // Elemento span para milisegundos (.ms)
    #startBtn = null; // Botón Iniciar
    #pauseBtn = null; // Botón Pausar
    #lapBtn = null; // Botón Vuelta
    #resetBtn = null; // Botón Reiniciar
    #lapsList = null; // Elemento de lista <ol> de vueltas
    #lapCountElement = null; // Elemento de texto con el contador de vueltas
    #lapEmptyElement = null; // Mensaje visual de "sin vueltas"
    #lastRenderedText = ''; // Caché del último texto formateado para evitar reflows innecesarios
    #lastMainPart = ''; // Caché de la parte MM:SS para actualizar solo cuando cambie el segundo
    constructor({ // Constructor que recibe todos los nodos del DOM necesarios
      display,
      timeElement,
      mainTimeElement,
      msTimeElement,
      startBtn,
      pauseBtn,
      lapBtn,
      resetBtn,
      lapsList,
      lapCountElement,
      lapEmptyElement
    }) { // Asignación de cada elemento a su propiedad privada
      this.#display = display; // Guarda referencia a la pantalla
      this.#timeElement = timeElement; // Guarda referencia al contenedor de tiempo
      this.#mainTimeElement = mainTimeElement; // Guarda referencia a los dígitos principales
      this.#msTimeElement = msTimeElement; // Guarda referencia al sufijo de milisegundos
      this.#startBtn = startBtn; // Guarda referencia al botón iniciar
      this.#pauseBtn = pauseBtn; // Guarda referencia al botón pausar
      this.#lapBtn = lapBtn; // Guarda referencia al botón vuelta
      this.#resetBtn = resetBtn; // Guarda referencia al botón reiniciar
      this.#lapsList = lapsList; // Guarda referencia a la lista ordenada de vueltas
      this.#lapCountElement = lapCountElement; // Guarda referencia al contador de vueltas
      this.#lapEmptyElement = lapEmptyElement; // Guarda referencia al aviso de lista vacía
    } // Fin del constructor
    renderTime(ms) { // Actualiza eficientemente los números en la pantalla del cronómetro
      const text = formatTime(ms, { showMs: true }); // Convierte los ms al formato "MM:SS.ms"
      if (text !== this.#lastRenderedText) { // Solo manipula el DOM si el texto cambió respecto al fotograma anterior
        this.#lastRenderedText = text; // Actualiza el valor en caché
        const dotIndex = text.indexOf('.'); // Ubica la posición del punto decimal que separa los milisegundos
        if (dotIndex !== -1 && this.#mainTimeElement && this.#msTimeElement) { // Si los elementos separados existen
          const mainPart = text.slice(0, dotIndex); // Extrae la parte "MM:SS"
          const msPart = text.slice(dotIndex); // Extrae la parte ".ms"
          if (mainPart !== this.#lastMainPart) { // Solo actualiza la parte principal si el segundo cambió
            this.#mainTimeElement.textContent = mainPart; // Actualiza MM:SS en el DOM
            this.#lastMainPart = mainPart; // Actualiza la caché
          } // Fin de actualización principal
          this.#msTimeElement.textContent = msPart; // Actualiza siempre las centésimas en el DOM
        } else { // Si no están los elementos separados
          this.#timeElement.textContent = text; // Escribe el texto completo de golpe
        } // Fin de asignación
      } // Fin de comprobación de caché
    } // Fin de renderTime
    renderState(state, canStart = true) { // Actualiza clases CSS y estados habilitados/deshabilitados de los botones
      this.#display.classList.remove('display--idle', 'display--running', 'display--paused', 'display--finished'); // Elimina clases de estado previas
      this.#display.classList.add(`display--${state}`); // Añade la clase visual del nuevo estado actual
      switch (state) { // Configura los botones según el estado
        case STATE.IDLE: // Si está en reposo
          this.#startBtn.disabled = !canStart; // Habilita o deshabilita Iniciar según se pueda arrancar
          this.#startBtn.textContent = 'Iniciar'; // Etiqueta del botón en "Iniciar"
          this.#pauseBtn.disabled = true; // Deshabilita Pausar
          this.#lapBtn.disabled = true; // Deshabilita Vuelta
          this.#resetBtn.disabled = true; // Deshabilita Reiniciar
          break; // Fin del caso IDLE
        case STATE.RUNNING: // Si está corriendo
          this.#startBtn.disabled = true; // Deshabilita Iniciar
          this.#startBtn.textContent = 'Iniciar'; // Mantiene texto "Iniciar"
          this.#pauseBtn.disabled = false; // Habilita Pausar
          this.#lapBtn.disabled = false; // Habilita Vuelta
          this.#resetBtn.disabled = false; // Habilita Reiniciar
          break; // Fin del caso RUNNING
        case STATE.PAUSED: // Si está pausado
          this.#startBtn.disabled = !canStart; // Habilita Iniciar/Reanudar
          this.#startBtn.textContent = 'Reanudar'; // Cambia el texto del botón a "Reanudar"
          this.#pauseBtn.disabled = true; // Deshabilita Pausar
          this.#lapBtn.disabled = true; // Deshabilita Vuelta
          this.#resetBtn.disabled = false; // Mantiene habilitado Reiniciar
          break; // Fin del caso PAUSED
        default: // Cualquier otro caso no previsto
          break; // No hace nada
      } // Fin del switch
    } // Fin de renderState
    renderLaps(laps) { // Renderiza la tabla/lista de vueltas registradas
      this.#lapsList.replaceChildren(); // Vacía completamente la lista en el DOM
      const count = laps?.length ?? 0; // Cuenta cuántas vueltas hay registradas
      if (this.#lapCountElement) { // Si existe el elemento contador
        this.#lapCountElement.textContent = count === 1 ? '1 vuelta' : `${count} vueltas`; // Actualiza texto singular o plural
      } // Fin de contador
      if (this.#lapEmptyElement) { // Si existe el aviso de lista vacía
        if (count > 0) { // Si hay al menos una vuelta
          this.#lapEmptyElement.setAttribute('hidden', ''); // Oculta el mensaje de "sin vueltas"
        } else { // Si no hay vueltas
          this.#lapEmptyElement.removeAttribute('hidden'); // Muestra el mensaje de lista vacía
        } // Fin de toggle de aviso
      } // Fin de empty element
      if (!laps || laps.length === 0) { // Si la lista viene vacía
        return; // Sale sin construir elementos
      } // Fin de verificación
      const { fastestId, slowestId } = computeLapStats(laps); // Obtiene los IDs de la vuelta más rápida y más lenta
      const fragment = document.createDocumentFragment(); // Crea un fragmento de documento en memoria para un único reflow en el DOM
      for (let i = laps.length - 1; i >= 0; i -= 1) { // Itera en orden inverso para mostrar la última vuelta arriba
        const lap = laps[i]; // Obtiene los datos de la vuelta actual
        const li = document.createElement('li'); // Crea el elemento de lista <li>
        li.className = 'lap-list__item'; // Asigna la clase base del ítem
        const isFastest = lap.id === fastestId; // Comprueba si esta vuelta es la más rápida
        const isSlowest = lap.id === slowestId; // Comprueba si esta vuelta es la más lenta
        if (isFastest) { // Si es la más rápida
          li.classList.add('lap-list__item--fastest'); // Añade clase de estilo verde/destacado positivo
        } else if (isSlowest) { // Si es la más lenta
          li.classList.add('lap-list__item--slowest'); // Añade clase de estilo rojo/destacado negativo
        } // Fin de condicional de estilo
        const numSpan = document.createElement('span'); // Crea el contenedor del número de vuelta
        numSpan.className = 'lap-list__col lap-list__col--number'; // Asigna clase de columna
        numSpan.textContent = String(lap.lapNumber).padStart(2, '0'); // Muestra el número con relleno de 2 dígitos
        const splitSpan = document.createElement('span'); // Crea la columna para el tiempo parcial (split)
        splitSpan.className = 'lap-list__col lap-list__col--split'; // Asigna clase de columna
        const splitTime = document.createElement('span'); // Contenedor para el texto del tiempo parcial
        splitTime.className = 'lap-list__time'; // Clase de formato de tiempo
        splitTime.textContent = `+${formatTime(lap.splitMs, { showMs: true })}`; // Formatea como "+MM:SS.ms"
        splitSpan.appendChild(splitTime); // Inserta el texto dentro de la columna parcial
        if (isFastest) { // Si fue la más rápida
          const badge = document.createElement('span'); // Crea una etiqueta insignia (badge)
          badge.className = 'lap-list__badge lap-list__badge--fastest'; // Aplica estilo visual de insignia rápida
          badge.textContent = 'Rápida'; // Texto de la insignia
          splitSpan.appendChild(badge); // Inserta la insignia al lado del tiempo
        } else if (isSlowest) { // Si fue la más lenta
          const badge = document.createElement('span'); // Crea insignia
          badge.className = 'lap-list__badge lap-list__badge--slowest'; // Aplica estilo visual de insignia lenta
          badge.textContent = 'Lenta'; // Texto de la insignia
          splitSpan.appendChild(badge); // Inserta la insignia
        } // Fin de creación de badges
        const totalSpan = document.createElement('span'); // Crea la columna para el tiempo total acumulado
        totalSpan.className = 'lap-list__col lap-list__col--total'; // Asigna clase de columna
        totalSpan.textContent = formatTime(lap.totalMs, { showMs: true }); // Muestra el total transcurrido en esa vuelta
        li.appendChild(numSpan); // Agrega la columna de número al <li>
        li.appendChild(splitSpan); // Agrega la columna parcial al <li>
        li.appendChild(totalSpan); // Agrega la columna total al <li>
        fragment.appendChild(li); // Agrega el <li> completo al fragmento en memoria
      } // Fin del bucle for
      this.#lapsList.replaceChildren(fragment); // Inserta todo el fragmento al DOM de una sola vez
    } // Fin de renderLaps
  } // Fin de la clase StopwatchView
  // ===== Vista de temporizador ===== // Manipulación del DOM para el temporizador
  class CountdownView { // Controla la interfaz y elementos del temporizador
    #display = null; // Contenedor de la pantalla digital
    #timeElement = null; // Elemento con el texto de tiempo restante
    #startBtn = null; // Botón Iniciar
    #pauseBtn = null; // Botón Pausar
    #resetBtn = null; // Botón Reiniciar
    #minutesInput = null; // Campo de entrada para minutos
    #secondsInput = null; // Campo de entrada para segundos
    #errorElement = null; // Párrafo para mostrar mensajes de error de validación
    #alertBanner = null; // Contenedor de alerta visual de fin de tiempo
    #presetButtons = []; // Arreglo de botones con tiempos predefinidos (1m, 5m, etc.)
    #lastRenderedText = ''; // Caché del último texto renderizado para evitar repintes
    constructor({ // Constructor que recibe los elementos del temporizador
      display,
      timeElement,
      startBtn,
      pauseBtn,
      resetBtn,
      minutesInput,
      secondsInput,
      errorElement,
      alertBanner,
      presetButtons
    }) { // Asignación de propiedades
      this.#display = display; // Guarda referencia a la pantalla
      this.#timeElement = timeElement; // Guarda referencia al texto del tiempo
      this.#startBtn = startBtn; // Guarda referencia al botón iniciar
      this.#pauseBtn = pauseBtn; // Guarda referencia al botón pausar
      this.#resetBtn = resetBtn; // Guarda referencia al botón reiniciar
      this.#minutesInput = minutesInput; // Guarda referencia al input de minutos
      this.#secondsInput = secondsInput; // Guarda referencia al input de segundos
      this.#errorElement = errorElement; // Guarda referencia al contenedor de error
      this.#alertBanner = alertBanner; // Guarda referencia al banner de alerta
      this.#presetButtons = Array.from(presetButtons); // Convierte y guarda los botones de acceso rápido
    } // Fin del constructor
    renderTime(ms) { // Actualiza el reloj del temporizador en pantalla
      const text = formatTime(ms, { isCeil: true, showMs: false }); // Formatea sin milisegundos y redondeando hacia arriba
      if (text !== this.#lastRenderedText) { // Comprueba si el texto ha cambiado
        this.#timeElement.textContent = text; // Actualiza el texto en el DOM
        this.#lastRenderedText = text; // Guarda en caché el nuevo texto
      } // Fin de comprobación
    } // Fin de renderTime
    renderState(state, isInputValid = true) { // Actualiza clases y bloquea/desbloquea inputs y botones
      this.#display.classList.remove('display--idle', 'display--running', 'display--paused', 'display--finished'); // Limpia clases previas
      this.#display.classList.add(`display--${state}`); // Añade la clase del estado actual
      const areInputsLocked = state === STATE.RUNNING || state === STATE.PAUSED || state === STATE.FINISHED; // Determina si se deben bloquear los campos
      this.#minutesInput.disabled = areInputsLocked; // Deshabilita o habilita el campo de minutos
      this.#secondsInput.disabled = areInputsLocked; // Deshabilita o habilita el campo de segundos
      this.#presetButtons.forEach((btn) => { // Recorre los botones preestablecidos
        btn.disabled = areInputsLocked; // Bloquea los botones si el temporizador está en marcha o pausado
      }); // Fin de forEach
      switch (state) { // Configura los controles según el estado del temporizador
        case STATE.IDLE: // En reposo
          this.#startBtn.disabled = !isInputValid; // Solo habilita Iniciar si los números ingresados son válidos
          this.#startBtn.textContent = 'Iniciar'; // Texto "Iniciar"
          this.#pauseBtn.disabled = true; // Pausa deshabilitada
          this.#resetBtn.disabled = true; // Reiniciar deshabilitado
          break; // Fin de IDLE
        case STATE.RUNNING: // En ejecución
          this.#startBtn.disabled = true; // Iniciar deshabilitado
          this.#startBtn.textContent = 'Iniciar'; // Mantiene "Iniciar"
          this.#pauseBtn.disabled = false; // Habilita botón de pausa
          this.#resetBtn.disabled = false; // Habilita botón de reinicio
          break; // Fin de RUNNING
        case STATE.PAUSED: // En pausa
          this.#startBtn.disabled = false; // Habilita Iniciar para reanudar
          this.#startBtn.textContent = 'Reanudar'; // Cambia texto a "Reanudar"
          this.#pauseBtn.disabled = true; // Deshabilita botón de pausa
          this.#resetBtn.disabled = false; // Habilita botón de reinicio
          break; // Fin de PAUSED
        case STATE.FINISHED: // Tiempo terminado
          this.#startBtn.disabled = true; // Iniciar deshabilitado
          this.#startBtn.textContent = 'Iniciar'; // Texto "Iniciar"
          this.#pauseBtn.disabled = true; // Pausa deshabilitada
          this.#resetBtn.disabled = false; // Solo permite reiniciar
          break; // Fin de FINISHED
        default: // Caso por defecto
          break; // Sin acción
      } // Fin del switch
    } // Fin de renderState
    showError(message) { // Despliega un mensaje de error y marca los campos como inválidos
      this.#errorElement.textContent = message; // Coloca el texto explicativo del error en pantalla
      this.#minutesInput.setAttribute('aria-invalid', 'true'); // Marca el input de minutos como inválido para accesibilidad
      this.#secondsInput.setAttribute('aria-invalid', 'true'); // Marca el input de segundos como inválido para accesibilidad
    } // Fin de showError
    clearError() { // Limpia los mensajes y estados de error
      this.#errorElement.textContent = ''; // Vacía el contenido de texto del error
      this.#minutesInput.removeAttribute('aria-invalid'); // Quita el atributo aria-invalid del input de minutos
      this.#secondsInput.removeAttribute('aria-invalid'); // Quita el atributo aria-invalid del input de segundos
    } // Fin de clearError
    showFinishedAlert() { // Hace visible el banner de alerta cuando el tiempo termina
      this.#alertBanner.removeAttribute('hidden'); // Quita el atributo hidden para mostrar la alerta
    } // Fin de showFinishedAlert
    clearFinishedAlert() { // Oculta el banner de alerta de fin de tiempo
      this.#alertBanner.setAttribute('hidden', ''); // Vuelve a colocar el atributo hidden
    } // Fin de clearFinishedAlert
    setInputs(minutes, seconds) { // Llena programáticamente los campos de minutos y segundos
      this.#minutesInput.value = String(minutes).padStart(2, '0'); // Asigna minutos formateados con dos dígitos
      this.#secondsInput.value = String(seconds).padStart(2, '0'); // Asigna segundos formateados con dos dígitos
    } // Fin de setInputs
    getInputValues() { // Lee los valores actuales escritos en los inputs
      return { // Retorna los valores en un objeto
        minutes: this.#minutesInput.value, // Valor del input de minutos
        seconds: this.#secondsInput.value // Valor del input de segundos
      }; // Cierre del objeto retornado
    } // Fin de getInputValues
  } // Fin de la clase CountdownView
  // ===== Controlador principal ===== // Coordina las vistas, modelos y eventos de toda la app
  class AppController { // Orquestador de la aplicación
    #stopwatch = null; // Instancia del modelo Stopwatch
    #countdown = null; // Instancia del modelo Countdown
    #alarmPlayer = null; // Instancia del reproductor de sonido
    #tabsView = null; // Instancia de la vista de navegación por pestañas
    #stopwatchView = null; // Instancia de la vista del cronómetro
    #countdownView = null; // Instancia de la vista del temporizador
    #announcerElement = null; // Elemento para emitir anuncios por voz a lectores de pantalla
    #currentMode = MODE.STOPWATCH; // Modo activo actualmente (inicia en cronómetro)
    constructor() { // Constructor principal
      this.#initElements(); // Inicializa elementos del DOM y enlaza toda la aplicación
    } // Fin del constructor
    #announce(message) { // Escribe mensajes en el área viva de accesibilidad para lectores de pantalla
      if (this.#announcerElement) { // Si existe el elemento en la página
        this.#announcerElement.textContent = message; // Cambia el texto para que el lector de pantalla lo pronuncie
      } // Fin de comprobación
    } // Fin de #announce
    #initElements() { // Busca todos los nodos del DOM y crea las instancias
      const tabElements = document.querySelectorAll('.tabs__item'); // Obtiene todos los botones de pestañas
      const panelElements = document.querySelectorAll('.panel'); // Obtiene todos los paneles de contenido
      this.#announcerElement = document.getElementById('sr-announcements'); // Obtiene el contenedor de accesibilidad
      const swDisplay = document.getElementById('stopwatch-display'); // Pantalla del cronómetro
      const swTime = document.getElementById('stopwatch-time'); // Contenedor del tiempo del cronómetro
      const swMain = document.getElementById('stopwatch-main'); // Dígitos principales MM:SS del cronómetro
      const swMs = document.getElementById('stopwatch-ms'); // Dígitos de milisegundos .ms del cronómetro
      const swStart = document.getElementById('stopwatch-start'); // Botón iniciar cronómetro
      const swPause = document.getElementById('stopwatch-pause'); // Botón pausar cronómetro
      const swLap = document.getElementById('stopwatch-lap'); // Botón registrar vuelta
      const swReset = document.getElementById('stopwatch-reset'); // Botón reiniciar cronómetro
      const swLaps = document.getElementById('stopwatch-laps'); // Lista de vueltas
      const lapCount = document.getElementById('lap-count'); // Texto de conteo de vueltas
      const lapEmpty = document.getElementById('lap-empty'); // Texto de aviso sin vueltas
      const cdDisplay = document.getElementById('countdown-display'); // Pantalla del temporizador
      const cdTime = document.getElementById('countdown-time'); // Texto del tiempo del temporizador
      const cdStart = document.getElementById('countdown-start'); // Botón iniciar temporizador
      const cdPause = document.getElementById('countdown-pause'); // Botón pausar temporizador
      const cdReset = document.getElementById('countdown-reset'); // Botón reiniciar temporizador
      const cdMinutes = document.getElementById('countdown-minutes'); // Input de minutos
      const cdSeconds = document.getElementById('countdown-seconds'); // Input de segundos
      const cdError = document.getElementById('countdown-error'); // Mensaje de error del temporizador
      const cdAlert = document.getElementById('countdown-alert'); // Banner de alerta terminada
      const cdPresets = document.querySelectorAll('.button--preset'); // Botones de tiempos rápidos
      if ( // Verifica que todos los elementos críticos existan en el DOM antes de continuar
        !swDisplay || !swTime || !swStart || !swPause || !swLap || !swReset || !swLaps ||
        !cdDisplay || !cdTime || !cdStart || !cdPause || !cdReset || !cdMinutes || !cdSeconds || !cdError || !cdAlert
      ) { // Si falta alguno
        return; // Detiene la inicialización de forma segura para no provocar excepciones
      } // Fin de verificación
      this.#alarmPlayer = new AlarmPlayer(); // Instancia el servicio de sonido de la alarma
      this.#stopwatchView = new StopwatchView({ // Crea la vista del cronómetro con sus referencias del DOM
        display: swDisplay,
        timeElement: swTime,
        mainTimeElement: swMain,
        msTimeElement: swMs,
        startBtn: swStart,
        pauseBtn: swPause,
        lapBtn: swLap,
        resetBtn: swReset,
        lapsList: swLaps,
        lapCountElement: lapCount,
        lapEmptyElement: lapEmpty
      }); // Fin de instanciación de StopwatchView
      this.#countdownView = new CountdownView({ // Crea la vista del temporizador con sus referencias del DOM
        display: cdDisplay,
        timeElement: cdTime,
        startBtn: cdStart,
        pauseBtn: cdPause,
        resetBtn: cdReset,
        minutesInput: cdMinutes,
        secondsInput: cdSeconds,
        errorElement: cdError,
        alertBanner: cdAlert,
        presetButtons: cdPresets
      }); // Fin de instanciación de CountdownView
      this.#stopwatch = new Stopwatch({ // Crea el modelo del cronómetro y enlaza sus callbacks con la vista
        onTick: (ms) => this.#stopwatchView.renderTime(ms), // En cada tick actualiza el tiempo en pantalla
        onStateChange: (state) => { // Cuando cambie de estado (corriendo, pausado, etc.)
          const canStart = this.#stopwatch.getElapsedTime() < MAX_STOPWATCH_MS; // Comprueba que no supere el tope
          this.#stopwatchView.renderState(state, canStart); // Actualiza la UI de los botones
        }, // Fin de onStateChange
        onLapsChange: (laps) => this.#stopwatchView.renderLaps(laps) // En cada vuelta nueva o reseteo, actualiza la tabla
      }); // Fin de instanciación de Stopwatch
      this.#countdown = new Countdown({ // Crea el modelo del temporizador y enlaza sus callbacks con la vista
        onTick: (ms) => this.#countdownView.renderTime(ms), // En cada tick actualiza el tiempo restante en pantalla
        onStateChange: (state) => { // Cuando cambia el estado del temporizador
          const validation = this.#validateCountdownInputs(); // Valida las entradas numéricas actuales
          this.#countdownView.renderState(state, validation.ok); // Actualiza la UI de controles y botones
        }, // Fin de onStateChange
        onFinish: () => { // Cuando la cuenta regresiva llega a cero
          this.#alarmPlayer.play(); // Dispara la alarma sonora de tres pitidos
          this.#countdownView.showFinishedAlert(); // Muestra el banner visual de tiempo terminado
          this.#announce('¡Tiempo terminado! El temporizador ha finalizado.'); // Anuncia el evento por voz para accesibilidad
        } // Fin de onFinish
      }); // Fin de instanciación de Countdown
      this.#tabsView = new TabsView({ // Configura el gestor de navegación por pestañas
        tabElements, // Pasa los botones de pestaña
        panelElements, // Pasa los paneles
        onTabSelect: (tabId) => { // Callback ejecutado cuando el usuario hace clic o navega a otra pestaña
          const newMode = tabId === 'tab-countdown' ? MODE.COUNTDOWN : MODE.STOPWATCH; // Define cuál modo corresponde
          this.#handleModeChange(newMode); // Llama al gestor de cambio de modo
        } // Fin de onTabSelect
      }); // Fin de instanciación de TabsView
      this.#bindStopwatchEvents(swStart, swPause, swLap, swReset); // Enlaza eventos de clics a los botones del cronómetro
      this.#bindCountdownEvents(cdStart, cdPause, cdReset, cdMinutes, cdSeconds, cdPresets); // Enlaza eventos a los controles del temporizador
      this.#bindGlobalEvents(); // Enlaza eventos globales de teclado y cambio de visibilidad de pestaña
      this.#stopwatchView.renderState(STATE.IDLE); // Pone la vista del cronómetro en estado inactivo inicial
      this.#stopwatchView.renderTime(0); // Coloca el cronómetro en 00:00.00
      const initialValidation = this.#validateCountdownInputs(); // Valida los valores por defecto del formulario de temporizador (05:00)
      if (initialValidation.ok) { // Si son válidos
        this.#countdown.setDuration(initialValidation.ms); // Fija la duración en el modelo
        this.#countdownView.renderTime(initialValidation.ms); // Muestra 05:00 en la pantalla del temporizador
        this.#countdownView.renderState(STATE.IDLE, true); // Pone los controles en estado inactivo con Iniciar habilitado
      } else { // Si hubiera algún error
        this.#countdownView.renderState(STATE.IDLE, false); // Mantiene el botón Iniciar deshabilitado
      } // Fin de inicialización condicional
    } // Fin de #initElements
    #validateCountdownInputs() { // Valida los datos de los inputs del temporizador y actualiza mensajes de error
      const values = this.#countdownView.getInputValues(); // Obtiene lo escrito en minutos y segundos
      const result = parseTimerInput(values.minutes, values.seconds); // Aplica las reglas de validación
      if (result.ok) { // Si la validación fue exitosa
        this.#countdownView.clearError(); // Borra cualquier mensaje de error anterior
      } else { // Si hubo error
        this.#countdownView.showError(result.errorMessage); // Muestra el mensaje correspondiente al usuario
      } // Fin de validación
      return result; // Retorna el objeto con el resultado de la validación
    } // Fin de #validateCountdownInputs
    #handleModeChange(newMode) { // Gestiona el cambio entre pestañas/modos
      if (this.#currentMode === newMode) { // Si ya se encontraba en ese modo
        return; // No hace nada
      } // Fin de comprobación
      if (this.#currentMode === MODE.STOPWATCH) { // Si sale del cronómetro
        this.#stopwatch.reset(); // Reinicia el cronómetro para que no quede corriendo en segundo plano
      } else { // Si sale del temporizador
        this.#alarmPlayer.stop(); // Silencia la alarma si estaba sonando
        this.#countdownView.clearFinishedAlert(); // Oculta el banner de alerta
        this.#countdown.reset(); // Reinicia el temporizador
      } // Fin de limpieza por cambio de modo
      this.#currentMode = newMode; // Asigna el nuevo modo activo
      const modeName = newMode === MODE.STOPWATCH ? 'Cronómetro' : 'Temporizador'; // Nombre legible del modo
      this.#announce(`Modo cambiado a ${modeName}`); // Anuncia verbalmente el cambio para lectores de pantalla
    } // Fin de #handleModeChange
    #bindStopwatchEvents(startBtn, pauseBtn, lapBtn, resetBtn) { // Asigna listeners a los botones del cronómetro
      startBtn.addEventListener('click', () => { // Clic en Iniciar
        this.#alarmPlayer.init(); // Inicializa el AudioContext por interacción de usuario
        this.#stopwatch.start(); // Arranca el cronómetro
        this.#announce('Cronómetro iniciado'); // Notificación de voz
      }); // Fin de listener start
      pauseBtn.addEventListener('click', () => { // Clic en Pausar
        this.#stopwatch.pause(); // Pausa el cronómetro
        this.#announce('Cronómetro pausado'); // Notificación de voz
      }); // Fin de listener pause
      lapBtn.addEventListener('click', () => { // Clic en Vuelta
        const newLap = this.#stopwatch.lap(); // Registra una nueva vuelta
        if (newLap) { // Si se registró con éxito
          this.#announce(`Vuelta ${newLap.lapNumber} registrada: ${formatTime(newLap.splitMs, { showMs: true })}`); // Anuncia el tiempo de la vuelta
        } // Fin de comprobación
      }); // Fin de listener lap
      resetBtn.addEventListener('click', () => { // Clic en Reiniciar
        this.#stopwatch.reset(); // Restablece a cero el cronómetro
        this.#announce('Cronómetro reiniciado'); // Notificación de voz
      }); // Fin de listener reset
    } // Fin de #bindStopwatchEvents
    #bindCountdownEvents(startBtn, pauseBtn, resetBtn, minInput, secInput, presetButtons) { // Asigna listeners a controles del temporizador
      const handleInputChange = () => { // Maneja los cambios en los inputs numéricos
        if (this.#countdown.state !== STATE.IDLE) { // Solo permite cambios si el temporizador está en reposo
          return; // Sale si está corriendo o pausado
        } // Fin de comprobación
        const validation = this.#validateCountdownInputs(); // Valida lo escrito
        this.#countdownView.renderState(STATE.IDLE, validation.ok); // Actualiza estado de los botones
        if (validation.ok) { // Si el tiempo es válido
          this.#countdown.setDuration(validation.ms); // Actualiza la duración en el temporizador
          this.#countdownView.renderTime(validation.ms); // Actualiza el tiempo que se ve en pantalla
        } // Fin de actualización
      }; // Fin de handleInputChange
      const preventInvalidChars = (event) => { // Bloquea la entrada de caracteres problemáticos en inputs de número
        if (FORBIDDEN_KEY_CHARS.includes(event.key)) { // Si la tecla presionada es 'e', '+', '-', '.', etc.
          event.preventDefault(); // Impide que se escriba en el campo
        } // Fin de verificación
      }; // Fin de preventInvalidChars
      minInput.addEventListener('keydown', preventInvalidChars); // Asigna bloqueo de caracteres en minutos
      secInput.addEventListener('keydown', preventInvalidChars); // Asigna bloqueo de caracteres en segundos
      minInput.addEventListener('input', handleInputChange); // Reacciona ante cambios en minutos
      secInput.addEventListener('input', handleInputChange); // Reacciona ante cambios en segundos
      presetButtons.forEach((button) => { // Asigna evento clic a cada botón predefinido (1 min, 5 min, etc.)
        button.addEventListener('click', () => { // Al hacer clic en un preset
          if (this.#countdown.state !== STATE.IDLE) { // Solo si está en reposo
            return; // Sale
          } // Fin de comprobación
          const m = button.dataset.minutes ?? '0'; // Lee los minutos desde el data-attribute
          const s = button.dataset.seconds ?? '0'; // Lee los segundos desde el data-attribute
          this.#countdownView.setInputs(m, s); // Escribe los valores en los campos de entrada
          handleInputChange(); // Dispara la validación y actualización de pantalla
        }); // Fin de listener preset
      }); // Fin de forEach
      startBtn.addEventListener('click', () => { // Clic en Iniciar temporizador
        const validation = this.#validateCountdownInputs(); // Valida que los datos sean correctos
        if (!validation.ok) { // Si hay errores en las entradas
          this.#countdownView.renderState(STATE.IDLE, false); // Deshabilita Iniciar y no arranca
          return; // Sale
        } // Fin de comprobación
        this.#alarmPlayer.init(); // Inicializa el AudioContext por interacción del usuario
        if (this.#countdown.state === STATE.IDLE) { // Si estaba en reposo
          this.#countdown.setDuration(validation.ms); // Asegura que la duración esté sincronizada
        } // Fin de estado IDLE
        this.#countdown.start(); // Arranca la cuenta regresiva
        this.#announce('Temporizador iniciado'); // Notificación accesible
      }); // Fin de listener start
      pauseBtn.addEventListener('click', () => { // Clic en Pausar temporizador
        this.#countdown.pause(); // Pausa la cuenta regresiva
        this.#announce('Temporizador pausado'); // Notificación accesible
      }); // Fin de listener pause
      resetBtn.addEventListener('click', () => { // Clic en Reiniciar temporizador
        this.#alarmPlayer.stop(); // Apaga la alarma si estaba sonando
        this.#countdownView.clearFinishedAlert(); // Oculta el banner visual de alarma
        this.#countdown.reset(); // Restablece el tiempo al valor configurado
        const validation = this.#validateCountdownInputs(); // Revalida los campos
        this.#countdownView.renderState(STATE.IDLE, validation.ok); // Actualiza estado de botones
        if (validation.ok) { // Si es válido
          this.#countdownView.renderTime(validation.ms); // Vuelve a mostrar el tiempo original en pantalla
        } // Fin de actualización
        this.#announce('Temporizador reiniciado'); // Notificación accesible
      }); // Fin de listener reset
    } // Fin de #bindCountdownEvents
    #bindGlobalEvents() { // Configura los atajos de teclado globales y la sincronización de pestaña
      document.addEventListener('keydown', (event) => { // Escucha teclas presionadas en todo el documento
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) { // Ignora pulsaciones repetidas por mantener apretada la tecla o combinaciones con modificadores
          return; // Sale sin hacer nada
        } // Fin de comprobación
        const target = event.target; // Elemento HTML sobre el que se originó el evento
        const tagName = target?.tagName?.toLowerCase(); // Nombre de la etiqueta HTML en minúsculas
        const isInteractive = // Determina si el usuario está escribiendo o interactuando en un formulario
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          tagName === 'button' ||
          target?.getAttribute?.('role') === 'tab'; // Evita capturar atajos si está en inputs, botones o pestañas
        if (isInteractive) { // Si el foco está en un elemento interactivo
          return; // No ejecuta el atajo para no interferir con la escritura
        } // Fin de verificación
        const key = event.key; // Obtiene el nombre de la tecla presionada
        if (key === ' ' || key === 'Spacebar') { // Atajo: Barra Espaciadora (Iniciar / Pausar / Reanudar)
          event.preventDefault(); // Evita que la página haga scroll hacia abajo
          if (this.#currentMode === MODE.STOPWATCH) { // En modo cronómetro
            if (this.#stopwatch.state === STATE.RUNNING) { // Si está corriendo
              this.#stopwatch.pause(); // Lo pausa
              this.#announce('Cronómetro pausado'); // Notificación
            } else if (this.#stopwatch.getElapsedTime() < MAX_STOPWATCH_MS) { // Si está pausado o en reposo y dentro del límite
              this.#alarmPlayer.init(); // Inicializa audio
              this.#stopwatch.start(); // Lo inicia o reanuda
              this.#announce('Cronómetro iniciado'); // Notificación
            } // Fin de cronómetro
          } else { // En modo temporizador
            if (this.#countdown.state === STATE.RUNNING) { // Si está corriendo
              this.#countdown.pause(); // Lo pausa
              this.#announce('Temporizador pausado'); // Notificación
            } else if (this.#countdown.state === STATE.PAUSED) { // Si está pausado
              this.#countdown.start(); // Lo reanuda
              this.#announce('Temporizador reanudado'); // Notificación
            } else if (this.#countdown.state === STATE.IDLE) { // Si está en reposo
              const validation = this.#validateCountdownInputs(); // Valida las entradas
              if (validation.ok) { // Si los datos son válidos
                this.#alarmPlayer.init(); // Inicializa audio
                this.#countdown.setDuration(validation.ms); // Fija duración
                this.#countdown.start(); // Arranca el temporizador
                this.#announce('Temporizador iniciado'); // Notificación
              } // Fin de validación
            } // Fin de estados temporizador
          } // Fin de evaluación de modo
          return; // Termina la evaluación de la tecla espacio
        } // Fin del bloque de espacio
        if (key === 'l' || key === 'L') { // Atajo: Tecla L (Registrar Vuelta)
          if (this.#currentMode === MODE.STOPWATCH && this.#stopwatch.state === STATE.RUNNING) { // Solo en cronómetro y en ejecución
            event.preventDefault(); // Previene comportamientos por defecto
            const newLap = this.#stopwatch.lap(); // Registra la vuelta
            if (newLap) { // Si fue exitosa
              this.#announce(`Vuelta ${newLap.lapNumber} registrada: ${formatTime(newLap.splitMs, { showMs: true })}`); // Notifica tiempo de vuelta
            } // Fin de comprobación
          } // Fin de verificación de estado
          return; // Termina la evaluación de la tecla L
        } // Fin de tecla L
        if (key === 'r' || key === 'R') { // Atajo: Tecla R (Reiniciar)
          if (this.#currentMode === MODE.STOPWATCH) { // En modo cronómetro
            if (this.#stopwatch.state !== STATE.IDLE) { // Solo si no está ya en cero/reposo
              event.preventDefault(); // Previene acción por defecto
              this.#stopwatch.reset(); // Reinicia el cronómetro
              this.#announce('Cronómetro reiniciado'); // Notificación
            } // Fin de verificación
          } else { // En modo temporizador
            if (this.#countdown.state !== STATE.IDLE) { // Si el temporizador no está ya en reposo
              event.preventDefault(); // Previene acción por defecto
              this.#alarmPlayer.stop(); // Detiene el sonido si estaba sonando
              this.#countdownView.clearFinishedAlert(); // Oculta alerta de finalización
              this.#countdown.reset(); // Restablece el tiempo configurado
              const validation = this.#validateCountdownInputs(); // Valida inputs
              this.#countdownView.renderState(STATE.IDLE, validation.ok); // Actualiza estado de botones
              if (validation.ok) { // Si es válido
                this.#countdownView.renderTime(validation.ms); // Actualiza pantalla
              } // Fin de actualización
              this.#announce('Temporizador reiniciado'); // Notificación
            } // Fin de verificación
          } // Fin de evaluación de modo
        } // Fin de tecla R
      }); // Fin de listener global keydown
      document.addEventListener('visibilitychange', () => { // Detecta cuando el usuario cambia de pestaña o minimiza la ventana
        if (document.visibilityState === 'visible') { // Al volver a enfocar la pestaña del navegador
          this.#stopwatch.sync(); // Sincroniza inmediatamente el tiempo real del cronómetro
          this.#countdown.sync(); // Sincroniza inmediatamente el tiempo real de la cuenta regresiva
        } // Fin de visibilidad visible
      }); // Fin de listener visibilitychange
    } // Fin de #bindGlobalEvents
  } // Fin de la clase AppController
  // ===== Inicialización ===== // Punto de entrada al cargar la página
  document.addEventListener('DOMContentLoaded', () => { // Espera a que la estructura HTML esté completamente analizada y lista
    new AppController(); // Crea la instancia que inicializa y pone en marcha toda la aplicación
  }); // Fin del listener DOMContentLoaded
})(); // Ejecución inmediata de la función envolvente (IIFE)
