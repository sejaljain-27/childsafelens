import React from "react"
import { View, StyleSheet, Dimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

interface HeroSectionProps {
  title?: string
  highlightText?: string
  description?: string
  buttonText?: string
  onButtonClick?: () => void
  colors?: string[]
  distortion?: number
  swirl?: number
  speed?: number
  offsetX?: number
  className?: string
  titleClassName?: string
  descriptionClassName?: string
  buttonClassName?: string
  maxWidth?: string
  veilOpacity?: string
  fontFamily?: string
  fontWeight?: number
  children?: React.ReactNode
}

export function HeroSection({
  colors = ["#72b9bb", "#b5d9d9", "#ffd1bd", "#ffebe0", "#8cc5b8", "#dbf4a4"],
  children,
}: HeroSectionProps) {
  const screenWidth = Dimensions.get("window").width
  const screenHeight = Dimensions.get("window").height

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        locations={[0, 0.2, 0.4, 0.6, 0.8, 1]}
        style={[styles.background, { width: screenWidth, height: screenHeight }]}
      />
      <View style={styles.overlay} />
      <View style={styles.contentWrapper}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    flex: 1,
    width: "100%",
    minHeight: "100%",
    backgroundColor: "rgba(15, 23, 42, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  contentWrapper: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
})
