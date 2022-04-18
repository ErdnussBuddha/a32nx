'use strict';

import ts from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import scss from 'rollup-plugin-scss';
import commonjs from '@rollup/plugin-commonjs';

const { join } = require('path');

export default {
    input: join(__dirname, 'instrument.tsx'),
    output: {
        dir: '../../../../flybywire-aircraft-a320-neo/html_ui/Pages/VCockpit/Instruments/A32NX/ND',
        format: 'es',
    },
    plugins: [scss(
        { output: '../../../../flybywire-aircraft-a320-neo/html_ui/Pages/VCockpit/Instruments/A32NX/ND/nd.css' },
    ),
    resolve(), commonjs({ include: /node_modules/ }), ts()],
};
