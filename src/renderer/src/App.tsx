import { Counter } from './features/counter/Counter';
import './shared/styles/global.scss';

function App() {
  return (
    <div>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
        Electron + React + Redux Toolkit
      </h1>
      <Counter />
    </div>
  );
}

export default App;
