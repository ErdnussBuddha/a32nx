import React, { useState, memo } from 'react';
import { useInteractionEvents } from '@instruments/common/hooks.js';
import { DcduStatusMessage } from '@atsu/components/DcduLink';
import { Checkerboard } from './Checkerboard';

interface ColorizedWord {
    word: string;
    highlight: boolean;
}

interface ColorizedLine {
    length: number;
    words: ColorizedWord[];
}

type MessageVisualizationProps = {
    message: string,
    backgroundColor: [number, number, number],
    keepNewlines?: boolean,
    ignoreHighlight: boolean,
    cssClass: string,
    yStart: number,
    deltaY: number,
    seperatorLine?: number,
    updateSystemStatusMessage: (status: DcduStatusMessage) => void
}

function visualizeLine(line: ColorizedWord[], startIdx: number, startY: number, deltaY: number, useDeltaY: boolean, ignoreHighlight: boolean, backgroundActive: boolean) {
    if (startIdx >= line.length) {
        return <></>;
    }

    const highlight = line[startIdx].highlight && !ignoreHighlight;
    let className = 'message-tspan';
    if (backgroundActive) {
        className = 'message-onbackground';
    } else if (highlight) {
        className = ' message-highlight';
    }
    let nextIdx = line.length;
    let message = '';

    for (let i = startIdx; i < line.length; ++i) {
        message += `${line[i].word}\xa0`;
        if (i + 1 < line.length && line[i].highlight !== line[i + 1].highlight) {
            nextIdx = i + 1;
            break;
        }
    }

    if (startIdx === 0) {
        if (useDeltaY) {
            return (
                <>
                    <tspan x="224" dy={deltaY} className={className}>{message}</tspan>
                    {visualizeLine(line, nextIdx, startY, deltaY, useDeltaY, ignoreHighlight, backgroundActive)}
                </>
            );
        }
        return (
            <>
                <tspan x="224" y={startY} className={className}>{message}</tspan>
                {visualizeLine(line, nextIdx, startY, deltaY, useDeltaY, ignoreHighlight, backgroundActive)}
            </>
        );
    }

    // no new line
    return (
        <>
            <tspan className={className}>{message}</tspan>
            {visualizeLine(line, nextIdx, startY, deltaY, useDeltaY, ignoreHighlight, backgroundActive)}
        </>
    );
}

function visualizeLines(lines: ColorizedLine[], backgroundIdx: number, yStart: number, deltaY: number, ignoreHighlight: boolean) {
    if (lines.length === 0) {
        return <></>;
    }

    const firstLine = lines[0];
    lines.shift();

    let lineCount = 0;
    return (
        <>
            {visualizeLine(firstLine.words, 0, yStart, deltaY, false, ignoreHighlight, backgroundIdx <= 0)}
            {lines.map((line) => {
                lineCount += 1;
                return visualizeLine(line.words, 0, yStart, deltaY, true, ignoreHighlight, backgroundIdx <= lineCount);
            })}
        </>
    );
}

function colorizeWords(message: string, keepNewlines: boolean): ColorizedWord[] {
    const words: ColorizedWord[] = [];
    if (!keepNewlines) {
        message = message.replace(/\n/gi, ' ');
    }

    let highlightColor = false;
    const messageWords = message.match(/[-@_A-Z0-9]+|\[\s+\]/g);
    if (!messageWords) {
        return [];
    }

    for (let word of messageWords) {
        if (word.length === 0) {
            continue;
        }

        /* check if the color needs to be changed */
        const highlightMarkers: number[] = [];
        for (let i = 0; i < word.length; ++i) {
            if (word[i] === '@') highlightMarkers.push(i);
        }

        // replace the color marker
        word = word.replace(/@/gi, '');

        // we need to change the highlight state
        if (highlightMarkers.length === 1 && highlightMarkers[0] === 0) {
            highlightColor = !highlightColor;
        } else if (highlightMarkers.length !== 0) {
            highlightColor = !highlightColor;
        }

        words.push({ word, highlight: highlightColor });

        // only one word needs to be highlighted
        if (highlightMarkers.length === 1 && highlightMarkers[0] !== 0) {
            highlightColor = !highlightColor;
        } else if (highlightMarkers.length !== 0) {
            highlightColor = !highlightColor;
        }
    }

    return words;
}

function insertWord(lines: ColorizedLine[], word: ColorizedWord, keepNewlines: boolean): void {
    // create a new line, but ignore if the word is too long
    if (!keepNewlines) {
        if ((lines[lines.length - 1].length + word.word.length + 1) >= 27 && lines[lines.length - 1].length !== 0) {
            lines.push({ length: 0, words: [] });
        }
    }

    // add a space character
    if (lines[lines.length - 1].length !== 0) {
        lines[lines.length - 1].length += 1;
    }

    // add the word
    lines[lines.length - 1].length += word.word.length;
    lines[lines.length - 1].words.push(word);
}

function createVisualizationLines(message: string, keepNewlines: boolean): ColorizedLine[] {
    const lines: ColorizedLine[] = [];

    if (!keepNewlines) {
        const words = colorizeWords(message, keepNewlines);
        lines.push({ length: 0, words: [] });

        words.forEach((word) => {
            let newline = false;

            // iterate over forced newlines, if needed
            word.word.split(/_/).forEach((entry) => {
                // add a new line
                if (newline) {
                    lines.push({ length: 0, words: [] });
                }

                // insert the word
                insertWord(lines, { word: entry, highlight: word.highlight }, keepNewlines);
                newline = !keepNewlines;
            });
        });
    } else {
        const inputLines = message.split(/\n/);
        let lastLineHighlight = false;

        inputLines.forEach((line) => {
            const words = colorizeWords(line, keepNewlines);

            if (words.length !== 0) {
                // invert the highlights due to the old highlighted text of the last line
                if (lastLineHighlight) {
                    words.forEach((word) => word.highlight = !word.highlight);
                }
                lastLineHighlight = words[words.length - 1].highlight;
            }

            lines.push({ length: 0, words });
        });
    }

    return lines;
}

export const MessageVisualization: React.FC<MessageVisualizationProps> = memo(({
    message, backgroundColor, keepNewlines = false, ignoreHighlight, cssClass, yStart, deltaY,
    seperatorLine = undefined, updateSystemStatusMessage,
}) => {
    const [pageIndex, setPageIndex] = useState(0);
    const [pageCount, setPageCount] = useState(0);
    const maxLines = 5;

    useInteractionEvents(['A32NX_DCDU_BTN_MPL_POEMINUS', 'A32NX_DCDU_BTN_MPR_POEMINUS'], () => {
        if (pageCount === 0) {
            return;
        }

        if (pageIndex > 0) {
            updateSystemStatusMessage(DcduStatusMessage.NoMessage);
            setPageIndex(pageIndex - 1);
        } else {
            updateSystemStatusMessage(DcduStatusMessage.NoMorePages);
        }
    });
    useInteractionEvents(['A32NX_DCDU_BTN_MPL_POEPLUS', 'A32NX_DCDU_BTN_MPR_POEPLUS'], () => {
        if (pageCount === 0) {
            return;
        }

        if (pageCount > pageIndex + 1) {
            updateSystemStatusMessage(DcduStatusMessage.NoMessage);
            setPageIndex(pageIndex + 1);
        } else {
            updateSystemStatusMessage(DcduStatusMessage.NoMorePages);
        }
    });

    if (message.length === 0) {
        return <></>;
    }

    let lines = createVisualizationLines(message, keepNewlines);

    // get the number of pages
    const messagePageCount = Math.ceil(lines.length / maxLines);
    if (messagePageCount !== pageCount) {
        setPageCount(messagePageCount);
        setPageIndex(0);
    }

    // no text defined
    if (pageCount === 0) {
        return <></>;
    }

    // get the indices
    const startIndex = pageIndex * maxLines;
    const endIndex = Math.min(startIndex + maxLines, lines.length);

    // get visible lines
    lines = lines.slice(startIndex, endIndex);

    // calculate the position of the background rectangle
    let backgroundY = 472;
    let contentHeight = 120;
    let backgroundNeeded = false;
    if (backgroundColor[0] !== 0 || backgroundColor[1] !== 0 || backgroundColor[2] !== 0) {
        if (seperatorLine !== undefined) {
            if (seperatorLine >= endIndex) {
                // only the next message is visible
                contentHeight += lines.length * 230;
                backgroundNeeded = true;
            } else if (startIndex <= seperatorLine) {
                // seperator on the same page
                contentHeight += (endIndex - seperatorLine) * 230;
                backgroundY += (seperatorLine - startIndex) * 230;
                backgroundNeeded = true;
            }
        } else {
            contentHeight += lines.length * 230;
            backgroundNeeded = true;
        }
    }
    const rgb = `rgb(${backgroundColor[0]},${backgroundColor[1]},${backgroundColor[2]})`;
    let backgroundIdx = maxLines;
    if (backgroundNeeded) {
        if (seperatorLine && seperatorLine >= startIndex) {
            backgroundIdx = (seperatorLine - startIndex) >= maxLines ? 0 : (seperatorLine - startIndex);
        } else if (!seperatorLine) {
            backgroundIdx = 0;
        }
    }

    return (
        <>
            {backgroundNeeded && (
                <Checkerboard
                    x={130}
                    y={backgroundY}
                    width={3600}
                    height={contentHeight}
                    cellSize={10}
                    fill={rgb}
                />
            )}
            <text className={cssClass}>
                {visualizeLines(lines, backgroundIdx, yStart, deltaY, ignoreHighlight)}
            </text>
            {pageCount > 1 && (
                <>
                    <text className="status-atsu" fill="white" x="65%" y="2480">PG</text>
                    <text className="status-atsu" fill="white" x="65%" y="2720">
                        {pageIndex + 1}
                        {' '}
                        /
                        {' '}
                        {pageCount}
                    </text>
                </>
            )}
        </>
    );
});
